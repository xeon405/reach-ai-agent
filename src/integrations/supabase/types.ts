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
      ai_classifications: {
        Row: {
          booking_intent: boolean | null
          confidence: number | null
          created_at: string
          id: number
          intent: string | null
          interested: boolean | null
          lead_id: string | null
          message_id: string | null
          raw: Json | null
          reason: string | null
          requires_human: boolean | null
          sentiment: string | null
          suggested_action: string | null
          unsubscribe: boolean | null
          user_id: string
        }
        Insert: {
          booking_intent?: boolean | null
          confidence?: number | null
          created_at?: string
          id?: never
          intent?: string | null
          interested?: boolean | null
          lead_id?: string | null
          message_id?: string | null
          raw?: Json | null
          reason?: string | null
          requires_human?: boolean | null
          sentiment?: string | null
          suggested_action?: string | null
          unsubscribe?: boolean | null
          user_id: string
        }
        Update: {
          booking_intent?: boolean | null
          confidence?: number | null
          created_at?: string
          id?: never
          intent?: string | null
          interested?: boolean | null
          lead_id?: string | null
          message_id?: string | null
          raw?: Json | null
          reason?: string | null
          requires_human?: boolean | null
          sentiment?: string | null
          suggested_action?: string | null
          unsubscribe?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event: string
          id: number
          lead_id: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event: string
          id?: never
          lead_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event?: string
          id?: never
          lead_id?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ab_test: boolean
          autopilot: boolean
          campaign_image_url: string | null
          created_at: string
          delivery: string
          followups_enabled: boolean | null
          id: string
          name: string
          status: string
          target_icp: Json | null
          user_id: string
        }
        Insert: {
          ab_test?: boolean
          autopilot?: boolean
          campaign_image_url?: string | null
          created_at?: string
          delivery?: string
          followups_enabled?: boolean | null
          id?: string
          name: string
          status?: string
          target_icp?: Json | null
          user_id: string
        }
        Update: {
          ab_test?: boolean
          autopilot?: boolean
          campaign_image_url?: string | null
          created_at?: string
          delivery?: string
          followups_enabled?: boolean | null
          id?: string
          name?: string
          status?: string
          target_icp?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      email_threads: {
        Row: {
          gmail_thread_id: string | null
          high_priority: boolean
          id: string
          last_message_id: string | null
          lead_id: string | null
          turn_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          gmail_thread_id?: string | null
          high_priority?: boolean
          id?: string
          last_message_id?: string | null
          lead_id?: string | null
          turn_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          gmail_thread_id?: string | null
          high_priority?: boolean
          id?: string
          last_message_id?: string | null
          lead_id?: string | null
          turn_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      emails_sent: {
        Row: {
          ai_draft: string | null
          ai_paused: boolean
          ai_turns: number
          autoreplied: boolean
          body: string | null
          campaign_id: string | null
          follow_up_at: string | null
          follow_up_sent: boolean
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          last_ai_msg_at: string | null
          last_lead_msg_at: string | null
          lead_id: string | null
          opened: boolean
          opened_at: string | null
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
          ai_paused?: boolean
          ai_turns?: number
          autoreplied?: boolean
          body?: string | null
          campaign_id?: string | null
          follow_up_at?: string | null
          follow_up_sent?: boolean
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          last_ai_msg_at?: string | null
          last_lead_msg_at?: string | null
          lead_id?: string | null
          opened?: boolean
          opened_at?: string | null
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
          ai_paused?: boolean
          ai_turns?: number
          autoreplied?: boolean
          body?: string | null
          campaign_id?: string | null
          follow_up_at?: string | null
          follow_up_sent?: boolean
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          last_ai_msg_at?: string | null
          last_lead_msg_at?: string | null
          lead_id?: string | null
          opened?: boolean
          opened_at?: string | null
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
      follow_up_sequences: {
        Row: {
          active: boolean
          campaign_id: string
          created_at: string
          delay_days: number
          id: string
          step_number: number
          template: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          created_at?: string
          delay_days: number
          id?: string
          step_number: number
          template?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          template?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_up_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_tokens: {
        Row: {
          profile_id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          profile_id: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
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
      intro_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          requester_user_id: string
          resolved_at: string | null
          status: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          requester_user_id: string
          resolved_at?: string | null
          status?: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          requester_user_id?: string
          resolved_at?: string | null
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intro_requests_requester_user_id_fkey"
            columns: ["requester_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_requests_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          campaign_id: string | null
          category: string | null
          city: string | null
          company: string | null
          conv_mode: string
          country: string | null
          created_at: string
          email: string | null
          email_confidence: number | null
          email_is_disposable: boolean | null
          email_is_role: boolean | null
          email_source: string | null
          email_source_url: string | null
          email_status: string | null
          email_verification_reason: string | null
          followup_status: string | null
          followup_step: number | null
          id: string
          job_title: string | null
          lead_source: string | null
          lifecycle: string
          name: string | null
          next_followup_at: string | null
          normalized_email: string | null
          phone: string | null
          place_id: string | null
          rating: number | null
          status: string
          unsubscribed: boolean
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          campaign_id?: string | null
          category?: string | null
          city?: string | null
          company?: string | null
          conv_mode?: string
          country?: string | null
          created_at?: string
          email?: string | null
          email_confidence?: number | null
          email_is_disposable?: boolean | null
          email_is_role?: boolean | null
          email_source?: string | null
          email_source_url?: string | null
          email_status?: string | null
          email_verification_reason?: string | null
          followup_status?: string | null
          followup_step?: number | null
          id?: string
          job_title?: string | null
          lead_source?: string | null
          lifecycle?: string
          name?: string | null
          next_followup_at?: string | null
          normalized_email?: string | null
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          status?: string
          unsubscribed?: boolean
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          campaign_id?: string | null
          category?: string | null
          city?: string | null
          company?: string | null
          conv_mode?: string
          country?: string | null
          created_at?: string
          email?: string | null
          email_confidence?: number | null
          email_is_disposable?: boolean | null
          email_is_role?: boolean | null
          email_source?: string | null
          email_source_url?: string | null
          email_status?: string | null
          email_verification_reason?: string | null
          followup_status?: string | null
          followup_step?: number | null
          id?: string
          job_title?: string | null
          lead_source?: string | null
          lifecycle?: string
          name?: string | null
          next_followup_at?: string | null
          normalized_email?: string | null
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          status?: string
          unsubscribed?: boolean
          user_id?: string
          website?: string | null
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
      owner_alerts: {
        Row: {
          body: string | null
          created_at: string
          id: number
          kind: string
          lead_id: string | null
          priority: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: never
          kind: string
          lead_id?: string | null
          priority?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: never
          kind?: string
          lead_id?: string | null
          priority?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ai_generated_date: string | null
          ai_generated_today: number
          autopilot: boolean | null
          autopilot_country: string | null
          autopilot_niche: string | null
          booking_link: string | null
          business_description: string | null
          cities: string[] | null
          communication_style: string | null
          company: string | null
          created_at: string
          dont_claim: string | null
          email: string | null
          emails_sent_date: string | null
          emails_sent_today: number
          gmail_account_type: string
          gmail_connected: boolean
          gmail_email: string | null
          gmail_state: string
          has_product_image: boolean | null
          icp: Json | null
          id: string
          last_digest_date: string | null
          name: string | null
          network_mode: boolean
          notify_replies: boolean
          offer: string | null
          onboarded: boolean
          phone: string | null
          plan: string
          problem_solved: string | null
          referral_code: string | null
          referral_reward_plan: string | null
          referral_reward_until: string | null
          referred_by: string | null
          signature: string | null
          target_customer: string | null
          website_url: string | null
        }
        Insert: {
          ai_generated_date?: string | null
          ai_generated_today?: number
          autopilot?: boolean | null
          autopilot_country?: string | null
          autopilot_niche?: string | null
          booking_link?: string | null
          business_description?: string | null
          cities?: string[] | null
          communication_style?: string | null
          company?: string | null
          created_at?: string
          dont_claim?: string | null
          email?: string | null
          emails_sent_date?: string | null
          emails_sent_today?: number
          gmail_account_type?: string
          gmail_connected?: boolean
          gmail_email?: string | null
          gmail_state?: string
          has_product_image?: boolean | null
          icp?: Json | null
          id: string
          last_digest_date?: string | null
          name?: string | null
          network_mode?: boolean
          notify_replies?: boolean
          offer?: string | null
          onboarded?: boolean
          phone?: string | null
          plan?: string
          problem_solved?: string | null
          referral_code?: string | null
          referral_reward_plan?: string | null
          referral_reward_until?: string | null
          referred_by?: string | null
          signature?: string | null
          target_customer?: string | null
          website_url?: string | null
        }
        Update: {
          ai_generated_date?: string | null
          ai_generated_today?: number
          autopilot?: boolean | null
          autopilot_country?: string | null
          autopilot_niche?: string | null
          booking_link?: string | null
          business_description?: string | null
          cities?: string[] | null
          communication_style?: string | null
          company?: string | null
          created_at?: string
          dont_claim?: string | null
          email?: string | null
          emails_sent_date?: string | null
          emails_sent_today?: number
          gmail_account_type?: string
          gmail_connected?: boolean
          gmail_email?: string | null
          gmail_state?: string
          has_product_image?: boolean | null
          icp?: Json | null
          id?: string
          last_digest_date?: string | null
          name?: string | null
          network_mode?: boolean
          notify_replies?: boolean
          offer?: string | null
          onboarded?: boolean
          phone?: string | null
          plan?: string
          problem_solved?: string | null
          referral_code?: string | null
          referral_reward_plan?: string | null
          referral_reward_until?: string | null
          referred_by?: string | null
          signature?: string | null
          target_customer?: string | null
          website_url?: string | null
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
          last_error: string | null
          lead_id: string
          lease_until: string | null
          next_retry_at: string | null
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
          last_error?: string | null
          lead_id: string
          lease_until?: string | null
          next_retry_at?: string | null
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
          last_error?: string | null
          lead_id?: string
          lease_until?: string | null
          next_retry_at?: string | null
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
      support_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_chat_threads: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressions: {
        Row: {
          created_at: string
          email: string
          id: string
          lead_id: string | null
          reason: string
          source: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          lead_id?: string | null
          reason: string
          source?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          lead_id?: string | null
          reason?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppressions_lead_id_fkey"
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
      tracking_events: {
        Row: {
          campaign_id: string | null
          email_id: string | null
          event: string
          id: number
          lead_id: string | null
          occurred_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          email_id?: string | null
          event: string
          id?: never
          lead_id?: string | null
          occurred_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          email_id?: string | null
          event?: string
          id?: never
          lead_id?: string | null
          occurred_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "emails_sent"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          emails_sent_today: number
          limit_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          emails_sent_today?: number
          limit_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          emails_sent_today?: number
          limit_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_lead_followup: {
        Args: {
          p_campaign_id: string
          p_current_step: number
          p_lead_id: string
        }
        Returns: undefined
      }
      cancel_lead_followup: {
        Args: { p_lead_id: string; p_reason?: string }
        Returns: undefined
      }
      claim_queue_jobs_v2: {
        Args: { p_lease_minutes?: number; p_limit?: number }
        Returns: {
          attempts: number
          campaign_id: string
          created_at: string
          id: string
          last_error: string | null
          lead_id: string
          lease_until: string | null
          next_retry_at: string | null
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
      create_default_follow_ups: {
        Args: { p_campaign_id: string; p_user_id: string }
        Returns: undefined
      }
      init_lead_followup: {
        Args: {
          p_campaign_id: string
          p_initial_send_at: string
          p_lead_id: string
        }
        Returns: undefined
      }
      public_stats: {
        Args: never
        Returns: {
          agents: number
          emails_sent: number
          replies_detected: number
        }[]
      }
      referral_count: { Args: never; Returns: number }
      release_send_slot: { Args: { p_user: string }; Returns: undefined }
      reserve_send_slot: {
        Args: { p_cap: number; p_user: string }
        Returns: boolean
      }
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
