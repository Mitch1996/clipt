export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      attributions: {
        Row: {
          clip_id: string
          created_at: string
          id: string
          original_creator_profile_id: string
          share_basis_points: number
          signed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          clip_id: string
          created_at?: string
          id?: string
          original_creator_profile_id: string
          share_basis_points?: number
          signed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          clip_id?: string
          created_at?: string
          id?: string
          original_creator_profile_id?: string
          share_basis_points?: number
          signed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attributions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attributions_original_creator_profile_id_fkey"
            columns: ["original_creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          access_token_encrypted: string | null
          connected_at: string
          created_at: string
          id: string
          last_synced_at: string | null
          owner_id: string
          platform: string
          platform_user_id: string
          platform_username: string | null
          refresh_token_encrypted: string | null
          scopes: string[] | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          owner_id: string
          platform: string
          platform_user_id: string
          platform_username?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          owner_id?: string
          platform?: string
          platform_user_id?: string
          platform_username?: string | null
          refresh_token_encrypted?: string | null
          scopes?: string[] | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_posts: {
        Row: {
          clip_id: string
          created_at: string
          id: string
          last_synced_at: string | null
          like_count: number
          platform: string
          platform_post_id: string | null
          posted_at: string | null
          posted_by_profile_id: string | null
          updated_at: string
          view_count: number
        }
        Insert: {
          clip_id: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          like_count?: number
          platform: string
          platform_post_id?: string | null
          posted_at?: string | null
          posted_by_profile_id?: string | null
          updated_at?: string
          view_count?: number
        }
        Update: {
          clip_id?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          like_count?: number
          platform?: string
          platform_post_id?: string | null
          posted_at?: string | null
          posted_by_profile_id?: string | null
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "clip_posts_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clip_posts_posted_by_profile_id_fkey"
            columns: ["posted_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clips: {
        Row: {
          attribution_signature: string | null
          captions_json: Json | null
          clipper_profile_id: string | null
          created_at: string
          duration_seconds: number | null
          earnings_cents: number
          id: string
          processing_error: string | null
          source_channel_id: string | null
          source_codec: string | null
          source_creator_profile_id: string | null
          source_height: number | null
          source_kind: string | null
          source_platform: string | null
          source_url: string | null
          source_width: number | null
          status: string
          title: string | null
          updated_at: string
          vertical_video_r2_key: string | null
          video_r2_key: string | null
          view_count_total: number
        }
        Insert: {
          attribution_signature?: string | null
          captions_json?: Json | null
          clipper_profile_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          earnings_cents?: number
          id?: string
          processing_error?: string | null
          source_channel_id?: string | null
          source_codec?: string | null
          source_creator_profile_id?: string | null
          source_height?: number | null
          source_kind?: string | null
          source_platform?: string | null
          source_url?: string | null
          source_width?: number | null
          status?: string
          title?: string | null
          updated_at?: string
          vertical_video_r2_key?: string | null
          video_r2_key?: string | null
          view_count_total?: number
        }
        Update: {
          attribution_signature?: string | null
          captions_json?: Json | null
          clipper_profile_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          earnings_cents?: number
          id?: string
          processing_error?: string | null
          source_channel_id?: string | null
          source_codec?: string | null
          source_creator_profile_id?: string | null
          source_height?: number | null
          source_kind?: string | null
          source_platform?: string | null
          source_url?: string | null
          source_width?: number | null
          status?: string
          title?: string | null
          updated_at?: string
          vertical_video_r2_key?: string | null
          video_r2_key?: string | null
          view_count_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "clips_clipper_profile_id_fkey"
            columns: ["clipper_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_source_channel_id_fkey"
            columns: ["source_channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_source_creator_profile_id_fkey"
            columns: ["source_creator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings_ledger: {
        Row: {
          amount_cents: number
          clip_id: string | null
          created_at: string
          currency: string
          id: string
          occurred_at: string
          paid_out_at: string | null
          profile_id: string
          source: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          clip_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          occurred_at?: string
          paid_out_at?: string | null
          profile_id: string
          source: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          clip_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          occurred_at?: string
          paid_out_at?: string | null
          profile_id?: string
          source?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "earnings_ledger_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_ledger_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          handle: string
          id: string
          payout_balance_cents: number
          role: string
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          handle: string
          id: string
          payout_balance_cents?: number
          role?: string
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string
          id?: string
          payout_balance_cents?: number
          role?: string
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          segment: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          segment: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          segment?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

