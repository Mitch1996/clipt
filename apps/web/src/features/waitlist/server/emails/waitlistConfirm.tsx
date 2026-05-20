import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

interface WaitlistConfirmProps {
  email: string;
  segment: string;
}

const main = {
  backgroundColor: "#0A0A0A",
  fontFamily:
    "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  color: "#FAFAFA",
  margin: "0",
  padding: "0",
};

const container = {
  margin: "0 auto",
  padding: "48px 32px",
  maxWidth: "560px",
};

const accent = {
  color: "#FFE600",
  fontWeight: 700,
};

const heading = {
  fontSize: "32px",
  fontWeight: 800,
  letterSpacing: "-1px",
  lineHeight: "1.1",
  margin: "0 0 16px",
};

const body = {
  fontSize: "16px",
  lineHeight: "1.6",
  color: "#A3A3A3",
  margin: "0 0 16px",
};

const hr = {
  borderColor: "#242424",
  borderStyle: "solid",
  borderWidth: "1px 0 0 0",
  margin: "32px 0",
};

const fineprint = {
  fontSize: "12px",
  lineHeight: "1.5",
  color: "#737373",
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontWeight: 500,
};

export default function WaitlistConfirmEmail({
  email,
  segment,
}: WaitlistConfirmProps) {
  return (
    <Html>
      <Head />
      <Preview>You&rsquo;re on the Clipt waitlist.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            <Heading style={heading}>
              You&rsquo;re on the <span style={accent}>list</span>.
            </Heading>
            <Text style={body}>
              We logged <strong style={{ color: "#FAFAFA" }}>{email}</strong> as a{" "}
              <strong style={{ color: "#FAFAFA" }}>{segment}</strong>. We&rsquo;ll
              reach out as soon as your wave goes live.
            </Text>
            <Text style={body}>
              In the meantime: Clipt is the first clipping platform where
              streamers, fans, clippers, and brands all share in clip earnings.
              Every clip carries cryptographic proof of who made it. Every payout
              routes automatically. Stream. Clip. Earn together.
            </Text>
          </Section>
          <Hr style={hr} />
          <Text style={fineprint}>
            © 2026 Clipt · You&rsquo;re receiving this because you signed up at
            clipt.live
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
