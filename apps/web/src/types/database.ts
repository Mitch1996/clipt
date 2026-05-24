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
      brand_access_requests: {
        Row: {
          company_name: string
          company_url: string | null
          created_at: string
          id: string
          intended_use: string
          profile_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
        }
        Insert: {
          company_name: string
          company_url?: string | null
          created_at?: string
          id?: string
          intended_use: string
          profile_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
        }
        Update: {
          company_name?: string
          company_url?: string | null
          created_at?: string
          id?: string
          intended_use?: string
          profile_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_access_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_access_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          allowed_platforms: string[]
          brand_handle: string | null
          brand_profile_id: string
          brand_safety_tier: string
          brief: string
          budget_cents: number
          cpm_cents: number
          created_at: string
          ends_at: string | null
          geo: string[]
          id: string
          languages: string[]
          max_per_clip_cents: number | null
          niche: string
          spent_cents: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          allowed_platforms?: string[]
          brand_handle?: string | null
          brand_profile_id: string
          brand_safety_tier?: string
          brief?: string
          budget_cents?: number
          cpm_cents?: number
          created_at?: string
          ends_at?: string | null
          geo?: string[]
          id?: string
          languages?: string[]
          max_per_clip_cents?: number | null
          niche?: string
          spent_cents?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          allowed_platforms?: string[]
          brand_handle?: string | null
          brand_profile_id?: string
          brand_safety_tier?: string
          brief?: string
          budget_cents?: number
          cpm_cents?: number
          created_at?: string
          ends_at?: string | null
          geo?: string[]
          id?: string
          languages?: string[]
          max_per_clip_cents?: number | null
          niche?: string
          spent_cents?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_profile_id_fkey"
            columns: ["brand_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sources: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          position: number
          source_url: string | null
          source_video_r2_key: string | null
          title: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          position?: number
          source_url?: string | null
          source_video_r2_key?: string | null
          title?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          position?: number
          source_url?: string | null
          source_video_r2_key?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sources_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_submissions: {
        Row: {
          approved_at: string | null
          campaign_id: string
          clip_id: string
          clipper_profile_id: string
          created_at: string
          earned_cents: number
          id: string
          paid_at: string | null
          reviewer_notes: string | null
          status: string
          updated_at: string
          verified_views: number
        }
        Insert: {
          approved_at?: string | null
          campaign_id: string
          clip_id: string
          clipper_profile_id: string
          created_at?: string
          earned_cents?: number
          id?: string
          paid_at?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          verified_views?: number
        }
        Update: {
          approved_at?: string | null
          campaign_id?: string
          clip_id?: string
          clipper_profile_id?: string
          created_at?: string
          earned_cents?: number
          id?: string
          paid_at?: string | null
          reviewer_notes?: string | null
          status?: string
          updated_at?: string
          verified_views?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_submissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_submissions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_submissions_clipper_profile_id_fkey"
            columns: ["clipper_profile_id"]
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
          face_cam_corner: string | null
          face_cam_corner_confidence: number | null
          id: string
          is_live: boolean
          is_vtuber: boolean | null
          last_live_at: string | null
          last_live_check: string | null
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
          face_cam_corner?: string | null
          face_cam_corner_confidence?: number | null
          id?: string
          is_live?: boolean
          is_vtuber?: boolean | null
          last_live_at?: string | null
          last_live_check?: string | null
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
          face_cam_corner?: string | null
          face_cam_corner_confidence?: number | null
          id?: string
          is_live?: boolean
          is_vtuber?: boolean | null
          last_live_at?: string | null
          last_live_check?: string | null
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
          scheduled_for: string | null
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
          scheduled_for?: string | null
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
          scheduled_for?: string | null
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
          deleted_at: string | null
          duration_seconds: number | null
          earnings_cents: number
          face_cam_corner: string | null
          face_cam_corner_source: string | null
          id: string
          processing_error: string | null
          processing_step: string | null
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
          verification_attempts: number
          verification_status: string
          vertical_video_r2_key: string | null
          video_r2_key: string | null
          view_count_total: number
          visibility: string
        }
        Insert: {
          attribution_signature?: string | null
          captions_json?: Json | null
          clipper_profile_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          earnings_cents?: number
          face_cam_corner?: string | null
          face_cam_corner_source?: string | null
          id?: string
          processing_error?: string | null
          processing_step?: string | null
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
          verification_attempts?: number
          verification_status?: string
          vertical_video_r2_key?: string | null
          video_r2_key?: string | null
          view_count_total?: number
          visibility?: string
        }
        Update: {
          attribution_signature?: string | null
          captions_json?: Json | null
          clipper_profile_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          earnings_cents?: number
          face_cam_corner?: string | null
          face_cam_corner_source?: string | null
          id?: string
          processing_error?: string | null
          processing_step?: string | null
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
          verification_attempts?: number
          verification_status?: string
          vertical_video_r2_key?: string | null
          video_r2_key?: string | null
          view_count_total?: number
          visibility?: string
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
          stripe_subscription_id: string | null
          subscription_price_id: string | null
          subscription_renews_at: string | null
          subscription_status: string
          subscription_tier: string
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
          stripe_subscription_id?: string | null
          subscription_price_id?: string | null
          subscription_renews_at?: string | null
          subscription_status?: string
          subscription_tier?: string
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
          stripe_subscription_id?: string | null
          subscription_price_id?: string | null
          subscription_renews_at?: string | null
          subscription_status?: string
          subscription_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      stripe_events: {
        Row: {
          id: string
          type: string
          received_at: string
          payload: Json
        }
        Insert: {
          id: string
          type: string
          received_at?: string
          payload: Json
        }
        Update: {
          id?: string
          type?: string
          received_at?: string
          payload?: Json
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
      increment_clip_view: { Args: { p_clip_id: string }; Returns: undefined }
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

