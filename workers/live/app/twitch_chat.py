"""Twitch IRC chat listener (anonymous).

Twitch's IRC bridge accepts unauthenticated connections under the
`justinfan<random>` nickname. That gives us read-only chat access
without burning the user's OAuth token — same trade we made for
/helix/streams stream-status polling.

WebSocket protocol details (matches tmi.js):
  - Connect to wss://irc-ws.chat.twitch.tv/
  - Request capabilities: CAP REQ :twitch.tv/tags twitch.tv/commands
  - NICK justinfan{nonce}  (no PASS — anonymous read access)
  - JOIN #<channel_login_lowercase>
  - PRIVMSG lines arrive as IRC frames; PING → PONG keep-alive

We surface each PRIVMSG via an async callback so the spike detector
can do its thing. Reconnects exponentially backed off; the scheduler
restarts the whole task when the channel goes offline.
"""
from __future__ import annotations

import asyncio
import logging
import random
import re
import time
from typing import Awaitable, Callable

import websockets
from websockets.client import WebSocketClientProtocol

log = logging.getLogger(__name__)

_IRC_URL = "wss://irc-ws.chat.twitch.tv/"

# Match an IRC PRIVMSG line. We only need login + message text — tags
# (badges, color, etc.) are ignored for V1.
#   @tags :nick!user@host PRIVMSG #channel :text
_PRIVMSG_RE = re.compile(
    r"(?:@[^ ]*\s+)?:(?P<nick>[^!]+)![^ ]+\s+PRIVMSG\s+#(?P<channel>[^ ]+)\s+:(?P<text>.*)"
)


MessageHandler = Callable[[str, str, str, float], Awaitable[None]]
"""(channel_login, nick, text, ts_seconds) → awaitable"""


class TwitchChatListener:
    """Single-channel chat listener. One task per channel.

    The scheduler keeps a dict of {channel_id: TwitchChatListener}
    parallel to its ingestor task dict.
    """

    def __init__(
        self,
        channel_login: str,
        on_message: MessageHandler,
    ) -> None:
        self._login = channel_login.lower()
        self._on_message = on_message
        self._stop = asyncio.Event()
        self._ws: WebSocketClientProtocol | None = None

    @property
    def channel_login(self) -> str:
        return self._login

    def stop(self) -> None:
        self._stop.set()

    async def run(self) -> None:
        """Connect, JOIN, loop reading PRIVMSGs until told to stop.

        Reconnects with exponential backoff on websocket errors —
        Twitch IRC drops connections periodically and that's normal.
        """
        backoff = 1.0
        while not self._stop.is_set():
            try:
                await self._connect_and_listen()
                backoff = 1.0  # successful run resets backoff
            except asyncio.CancelledError:
                return
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "chat[%s]: ws error %s — reconnecting in %.1fs",
                    self._login, exc, backoff,
                )
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=backoff)
                    return  # stop requested during backoff
                except asyncio.TimeoutError:
                    backoff = min(backoff * 2, 30.0)

    async def _connect_and_listen(self) -> None:
        nonce = random.randint(10_000, 99_999_999)
        nick = f"justinfan{nonce}"

        async with websockets.connect(_IRC_URL, ping_interval=20, ping_timeout=10) as ws:
            self._ws = ws
            # Anonymous read handshake. Per Twitch IRC docs there is no
            # PASS line for justinfan; the NICK alone authenticates.
            # All IRC frames need \r\n terminators — Twitch parses each
            # ws message as a stream of CRLF-delimited lines.
            await ws.send(f"NICK {nick}\r\n")
            await ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands\r\n")
            # Wait for RPL_WELCOME (001) before JOIN, plus a brief
            # settle — Twitch ratepaces freshly-handshaken sessions
            # and JOIN too soon causes a silent disconnect.
            await self._wait_for_welcome(ws)
            await asyncio.sleep(0.5)
            await ws.send(f"JOIN #{self._login}\r\n")
            log.info("chat[%s]: joined as %s", self._login, nick)

            # Side task: close ws when self._stop fires so the async-for
            # loop below exits naturally with ConnectionClosed.
            async def _watch_stop():
                await self._stop.wait()
                await ws.close()

            watcher = asyncio.create_task(_watch_stop(), name=f"stop-watch-{self._login}")
            try:
                async for raw in ws:
                    text = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")
                    await self._handle_raw(text, ws)
            finally:
                watcher.cancel()
                self._ws = None

    async def _wait_for_welcome(self, ws: WebSocketClientProtocol) -> None:
        """Block until the IRC server sends the 001 RPL_WELCOME line.

        Twitch closes the connection if we JOIN before this lands, so
        we need the handshake to complete first. The CAP ACK + welcome
        + MOTD all arrive within ~200ms.
        """
        for _ in range(10):  # ~5s max
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
            except asyncio.TimeoutError:
                log.warning("chat[%s]: welcome wait timed out — proceeding", self._login)
                return
            text = raw if isinstance(raw, str) else raw.decode("utf-8", errors="replace")
            if " 001 " in text:
                return

    async def _handle_raw(self, raw: str, ws: WebSocketClientProtocol) -> None:
        # IRC frames are CRLF-delimited; a single recv() may carry multiple.
        for line in raw.split("\r\n"):
            if not line:
                continue
            if line.startswith("PING"):
                # Reply with the same payload — required to stay connected.
                payload = line[5:] if len(line) > 5 else ":tmi.twitch.tv"
                await ws.send(f"PONG {payload}")
                continue
            match = _PRIVMSG_RE.match(line)
            if not match:
                continue
            channel = match.group("channel")
            nick = match.group("nick")
            text = match.group("text")
            ts = time.time()
            try:
                await self._on_message(channel, nick, text, ts)
            except Exception as exc:  # noqa: BLE001
                log.warning("chat[%s]: on_message handler raised %s", self._login, exc)
