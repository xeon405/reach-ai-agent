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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          ab_test: boolean
          autopilot: boolean
          created_at: string
          id: string
          name: string
          status: string
          target_icp: Json | null
          user_id: string
        }
        Insert: {
          ab_test?: boolean
          autopilot?: boolean
          created_at?: string
          id?: string
          name: string
          status?: string
          target_icp?: Json | null
          user_id: string
        }
        Update: {
          ab_test?: boolean
          autopilot?: boolean
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
          ai_draft: string | null
          autoreplied: boolean
          body: string | null
          campaign_id: string | null
          follow_up_at: string | null
          follow_up_sent: boolean
          id: string
          lead_id: string | null
          opened: boolean
          replied: boolean
          reply_sentiment: string | null
          sent_at: string
          sequence: number
          subject: string | null
          user_id: string
          variant: string | null
        }
        Insert: {
          ai_draft?: string | null
          autoreplied?: boolean
          body?: string | null
          campaign_id?: string | null
          follow_up_at?: string | null
          follow_up_sent?: boolean
          id?: string
          lead_id?: string | null
          opened?: boolean
          replied?: boolean
          reply_sentiment?: string | null
          sent_at?: string
          sequence?: number
          subject?: string | null
          user_id: string
          variant?: string | null
        }
        Update: {
          ai_draft?: string | null
          autoreplied?: boolean
          body?: string | null
          campaign_id?: string | null
          follow_up_at?: string | null
          follow_up_sent?: boolean
          id?: string
          lead_id?: string | null
          opened?: boolean
          replied?: boolean
          reply_sentiment?: string | null
          sent_at?: string
          sequence?: number
          subject?: string | null
          user_id?: string
          variant?: string | null
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
      gmail_tokens: {
        Row: {
          access_token: string | null
          profile_id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          profile_id: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          profile_id?: string
          refresh_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
          unsubscribed: boolean
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
          unsubscribed?: boolean
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
          unsubscribed?: boolean
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
          ai_generated_date: string | null
          ai_generated_today: number
          autopilot: boolean | null
          autopilot_country: string | null
          autopilot_niche: string | null
          booking_link: string | null
          company: string | null
          created_at: string
          email: string | null
          emails_sent_date: string | null
          emails_sent_today: number
          gmail_connected: boolean
          gmail_email: string | null
          icp: Json | null
          id: string
          last_digest_date: string | null
          name: string | null
          notify_replies: boolean
          offer: string | null
          onboarded: boolean
          plan: string
          referral_code: string | null
          referred_by: string | null
          signature: string | null
        }
        Insert: {
          ai_generated_date?: string | null
          ai_generated_today?: number
          autopilot?: boolean | null
          autopilot_country?: string | null
          autopilot_niche?: string | null
          booking_link?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          emails_sent_date?: string | null
          emails_sent_today?: number
          gmail_connected?: boolean
          gmail_email?: string | null
          icp?: Json | null
          id: string
          last_digest_date?: string | null
          name?: string | null
          notify_replies?: boolean
          offer?: string | null
          onboarded?: boolean
          plan?: string
          referral_code?: string | null
          referred_by?: string | null
          signature?: string | null
        }
        Update: {
          ai_generated_date?: string | null
          ai_generated_today?: number
          autopilot?: boolean | null
          autopilot_country?: string | null
          autopilot_niche?: string | null
          booking_link?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          emails_sent_date?: string | null
          emails_sent_today?: number
          gmail_connected?: boolean
          gmail_email?: string | null
          icp?: Json | null
          id?: string
          last_digest_date?: string | null
          name?: string | null
          notify_replies?: boolean
          offer?: string | null
          onboarded?: boolean
          plan?: string
          referral_code?: string | null
          referred_by?: string | null
          signature?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_email: string | null
          referrer_id: string
          reward_days: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          referred_email?: string | null
          referrer_id: string
          reward_days?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          referred_email?: string | null
          referrer_id?: string
          reward_days?: number
          status?: string
        }
        Relationships: []
      }
      send_queue: {
        Row: {
          attempts: number
          campaign_id: string
          created_at: string
          id: string
          lead_id: string
          status: string
          updated_at: string | null
          user_id: string
          variant: string | null
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          id?: string
          lead_id: string
          status?: string
          updated_at?: string | null
          user_id: string
          variant?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "send_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "send_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      tools_rate_limit: {
        Row: {
          action: string
          created_at: string
          id: number
          ip: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: never
          ip: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: never
          ip?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_queue_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          campaign_id: string
          created_at: string
          id: string
          lead_id: string
          status: string
          updated_at: string | null
          user_id: string
          variant: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "send_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_ai_quota: { Args: { cap: number; uid: string }; Returns: boolean }
      public_stats: {
        Args: never
        Returns: {
          agents: number
          emails_sent: number
          replies_detected: number
        }[]
      }
      referral_count: { Args: never; Returns: number }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
