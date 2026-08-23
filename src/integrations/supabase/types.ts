export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          target_icp: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          target_icp?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          target_icp?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      emails_sent: {
        Row: {
          body: string | null
          campaign_id: string | null
          follow_up_at: string | null
          follow_up_sent: boolean
          id: string
          lead_id: string | null
          opened: boolean
          reply_sentiment: string | null
          replied: boolean
          sent_at: string
          sequence: number
          subject: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          follow_up_at?: string | null
          follow_up_sent?: boolean
          id?: string
          lead_id?: string | null
          opened?: boolean
          replied?: boolean
          sent_at?: string
          sequence?: number
          subject?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          follow_up_at?: string | null
          follow_up_sent?: boolean
          id?: string
          lead_id?: string | null
          opened?: boolean
          replied?: boolean
          sent_at?: string
          sequence?: number
          subject?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_sent_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_sent_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          campaign_id: string | null
          company: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          job_title: string | null
          name: string | null
          status: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          name?: string | null
          status?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          name?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          booked_at: string
          campaign_id: string | null
          id: string
          lead_id: string | null
          user_id: string
        }
        Insert: {
          booked_at?: string
          campaign_id?: string | null
          id?: string
          lead_id?: string | null
          user_id: string
        }
        Update: {
          booked_at?: string
          campaign_id?: string | null
          id?: string
          lead_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          gmail_connected: boolean
          gmail_email: string | null
          emails_sent_today: number
          emails_sent_date: string | null
          icp: Json | null
          id: string
          name: string | null
          booking_link: string | null
          last_digest_date: string | null
          autopilot: boolean | null
          autopilot_country: string | null
          autopilot_niche: string | null
          notify_replies: boolean
          offer: string | null
          onboarded: boolean
          plan: string
          referral_code: string | null
          referred_by: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          gmail_connected?: boolean
          gmail_email?: string | null
          emails_sent_today?: number
          emails_sent_date?: string | null
          icp?: Json | null
          id: string
          name?: string | null
          booking_link?: string | null
          last_digest_date?: string | null
          autopilot?: boolean | null
          autopilot_country?: string | null
          autopilot_niche?: string | null
          notify_replies?: boolean
          offer?: string | null
          onboarded?: boolean
          plan?: string
          referral_code?: string | null
          referred_by?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          gmail_connected?: boolean
          gmail_email?: string | null
          emails_sent_today?: number
          emails_sent_date?: string | null
          icp?: Json | null
          id?: string
          name?: string | null
          booking_link?: string | null
          last_digest_date?: string | null
          autopilot?: boolean | null
          autopilot_country?: string | null
          autopilot_niche?: string | null
          notify_replies?: boolean
          offer?: string | null
          onboarded?: boolean
          plan?: string
          referral_code?: string | null
          referred_by?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_ai_quota: { Args: { uid: string; cap: number }; Returns: boolean }
      public_stats: {
        Args: Record<string, never>
        Returns: { agents: number; emails_sent: number }[]
      }
      referral_count: { Args: Record<string, never>; Returns: number }
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
