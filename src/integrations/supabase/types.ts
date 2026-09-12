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
      agent_config: {
        Row: {
          changed_by: string | null
          created_at: string
          enabled: boolean
          id: string
          key: string
          scope: string
          scope_id: string | null
          updated_at: string
          value: Json
          version: number
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          scope: string
          scope_id?: string | null
          updated_at?: string
          value: Json
          version?: number
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          scope?: string
          scope_id?: string | null
          updated_at?: string
          value?: Json
          version?: number
        }
        Relationships: []
      }
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
      ai_cost_guest_state: {
        Row: {
          id: boolean
          last_reported_at: string | null
          updated_at: string
          used_daily_usd: number
          used_monthly_usd: number
          window_date: string
          window_month: string
        }
        Insert: {
          id?: boolean
          last_reported_at?: string | null
          updated_at?: string
          used_daily_usd?: number
          used_monthly_usd?: number
          window_date: string
          window_month: string
        }
        Update: {
          id?: boolean
          last_reported_at?: string | null
          updated_at?: string
          used_daily_usd?: number
          used_monthly_usd?: number
          window_date?: string
          window_month?: string
        }
        Relationships: []
      }
      ai_cost_state: {
        Row: {
          last_reported_at: string | null
          mode: string
          profile_id: string
          tripped_at: string | null
          tripped_reason: string | null
          trips: number
          updated_at: string
          used_daily_usd: number
          used_monthly_usd: number
          window_date: string
          window_month: string
        }
        Insert: {
          last_reported_at?: string | null
          mode?: string
          profile_id: string
          tripped_at?: string | null
          tripped_reason?: string | null
          trips?: number
          updated_at?: string
          used_daily_usd?: number
          used_monthly_usd?: number
          window_date: string
          window_month: string
        }
        Update: {
          last_reported_at?: string | null
          mode?: string
          profile_id?: string
          tripped_at?: string | null
          tripped_reason?: string | null
          trips?: number
          updated_at?: string
          used_daily_usd?: number
          used_monthly_usd?: number
          window_date?: string
          window_month?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_cost_state_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_spend_ledger: {
        Row: {
          campaign_id: string | null
          decision_id: string | null
          est_cost_usd: number
          fn: string
          id: string
          input_tokens: number
          kind: string
          lead_id: string | null
          model: string
          model_version: string | null
          output_tokens: number
          ts: string
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          decision_id?: string | null
          est_cost_usd?: number
          fn?: string
          id?: string
          input_tokens?: number
          kind?: string
          lead_id?: string | null
          model: string
          model_version?: string | null
          output_tokens?: number
          ts?: string
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          decision_id?: string | null
          est_cost_usd?: number
          fn?: string
          id?: string
          input_tokens?: number
          kind?: string
          lead_id?: string | null
          model?: string
          model_version?: string | null
          output_tokens?: number
          ts?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_spend_ledger_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_spend_ledger_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_spend_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          decision_id: string | null
          event: string
          id: number
          lead_id: string | null
          model_version: string | null
          payload: Json | null
          strategy_ref: string | null
          user_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          decision_id?: string | null
          event: string
          id?: never
          lead_id?: string | null
          model_version?: string | null
          payload?: Json | null
          strategy_ref?: string | null
          user_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          decision_id?: string | null
          event?: string
          id?: never
          lead_id?: string | null
          model_version?: string | null
          payload?: Json | null
          strategy_ref?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      campaign_learning: {
        Row: {
          campaign_id: string
          state: Json
          triggered_by: string
          updated_at: string
          version: number
        }
        Insert: {
          campaign_id: string
          state?: Json
          triggered_by?: string
          updated_at?: string
          version?: number
        }
        Update: {
          campaign_id?: string
          state?: Json
          triggered_by?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_learning_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
          forget_at: string | null
          gmail_thread_id: string | null
          high_priority: boolean
          id: string
          last_message_id: string | null
          last_summarized_at: string | null
          lead_id: string | null
          turn_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          forget_at?: string | null
          gmail_thread_id?: string | null
          high_priority?: boolean
          id?: string
          last_message_id?: string | null
          last_summarized_at?: string | null
          lead_id?: string | null
          turn_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          forget_at?: string | null
          gmail_thread_id?: string | null
          high_priority?: boolean
          id?: string
          last_message_id?: string | null
          last_summarized_at?: string | null
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
          connected_at: string | null
          profile_id: string
          refresh_token: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          profile_id: string
          refresh_token: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
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
      health_state: {
        Row: {
          active_since: string | null
          alert_count: number
          check_key: string
          escalated_at: string | null
          last_alerted_at: string | null
          last_seen_at: string | null
          resolved_at: string | null
        }
        Insert: {
          active_since?: string | null
          alert_count?: number
          check_key: string
          escalated_at?: string | null
          last_alerted_at?: string | null
          last_seen_at?: string | null
          resolved_at?: string | null
        }
        Update: {
          active_since?: string | null
          alert_count?: number
          check_key?: string
          escalated_at?: string | null
          last_alerted_at?: string | null
          last_seen_at?: string | null
          resolved_at?: string | null
        }
        Relationships: []
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
      lead_finder_caches: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          kind: string
          payload: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          kind: string
          payload: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          kind?: string
          payload?: Json
        }
        Relationships: []
      }
      lead_refresh: {
        Row: {
          city: string
          country: string
          last_live_search_at: string
          niche: string
          query: string | null
          refreshes: number
        }
        Insert: {
          city: string
          country: string
          last_live_search_at?: string
          niche: string
          query?: string | null
          refreshes?: number
        }
        Update: {
          city?: string
          country?: string
          last_live_search_at?: string
          niche?: string
          query?: string | null
          refreshes?: number
        }
        Relationships: []
      }
      lead_score: {
        Row: {
          computed_at: string
          expires_at: string
          features: Json
          lead_id: string
          score: number
          score_version: number
          tier: string
        }
        Insert: {
          computed_at?: string
          expires_at?: string
          features?: Json
          lead_id: string
          score: number
          score_version?: number
          tier?: string
        }
        Update: {
          computed_at?: string
          expires_at?: string
          features?: Json
          lead_id?: string
          score?: number
          score_version?: number
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
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
          end_time: string | null
          id: string
          invitee_email: string | null
          lead_id: string | null
          metadata: Json | null
          provider: string
          provider_event_id: string | null
          start_time: string | null
          status: string
          timezone: string | null
          user_id: string
        }
        Insert: {
          booked_at?: string
          campaign_id?: string | null
          end_time?: string | null
          id?: string
          invitee_email?: string | null
          lead_id?: string | null
          metadata?: Json | null
          provider?: string
          provider_event_id?: string | null
          start_time?: string | null
          status?: string
          timezone?: string | null
          user_id: string
        }
        Update: {
          booked_at?: string
          campaign_id?: string | null
          end_time?: string | null
          id?: string
          invitee_email?: string | null
          lead_id?: string | null
          metadata?: Json | null
          provider?: string
          provider_event_id?: string | null
          start_time?: string | null
          status?: string
          timezone?: string | null
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
      push_queue: {
        Row: {
          body: string | null
          created_at: string
          id: number
          kind: string | null
          lead_id: string | null
          priority: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: number
          kind?: string | null
          lead_id?: string | null
          priority?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: number
          kind?: string | null
          lead_id?: string | null
          priority?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_secret: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth_secret: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth_secret?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
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
      refresh_usage: {
        Row: {
          count: number
          day: string
        }
        Insert: {
          count?: number
          day: string
        }
        Update: {
          count?: number
          day?: string
        }
        Relationships: []
      }
      saved_businesses: {
        Row: {
          address: string | null
          category: string | null
          city: string | null
          company: string | null
          country: string
          discovered_by: string[]
          domain: string | null
          email: string | null
          email_confidence: number | null
          email_is_disposable: boolean | null
          email_is_role: boolean | null
          email_source: string | null
          email_source_url: string | null
          email_status: string | null
          email_verification_reason: string | null
          first_seen: string
          forgotten_by: string[]
          id: string
          job_title: string | null
          last_seen: string
          name: string | null
          niche: string
          phone: string | null
          place_id: string | null
          rating: number | null
          source: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          city?: string | null
          company?: string | null
          country: string
          discovered_by?: string[]
          domain?: string | null
          email?: string | null
          email_confidence?: number | null
          email_is_disposable?: boolean | null
          email_is_role?: boolean | null
          email_source?: string | null
          email_source_url?: string | null
          email_status?: string | null
          email_verification_reason?: string | null
          first_seen?: string
          forgotten_by?: string[]
          id?: string
          job_title?: string | null
          last_seen?: string
          name?: string | null
          niche: string
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          source?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          city?: string | null
          company?: string | null
          country?: string
          discovered_by?: string[]
          domain?: string | null
          email?: string | null
          email_confidence?: number | null
          email_is_disposable?: boolean | null
          email_is_role?: boolean | null
          email_source?: string | null
          email_source_url?: string | null
          email_status?: string | null
          email_verification_reason?: string | null
          first_seen?: string
          forgotten_by?: string[]
          id?: string
          job_title?: string | null
          last_seen?: string
          name?: string | null
          niche?: string
          phone?: string | null
          place_id?: string | null
          rating?: number | null
          source?: string | null
          website?: string | null
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
          priority: number
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
          priority?: number
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
          priority?: number
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
      sender_health: {
        Row: {
          bounce_rate_7d: number
          bounces_7d: number
          clean_days: number
          complaint_rate_7d: number
          current_cap: number
          gmail_email: string | null
          last_measured_at: string
          phase: string
          profile_id: string
          replies_7d: number
          reply_rate_7d: number
          sends_7d: number
          unsubs_7d: number
          updated_at: string
          warm_cap: number
        }
        Insert: {
          bounce_rate_7d?: number
          bounces_7d?: number
          clean_days?: number
          complaint_rate_7d?: number
          current_cap?: number
          gmail_email?: string | null
          last_measured_at?: string
          phase?: string
          profile_id: string
          replies_7d?: number
          reply_rate_7d?: number
          sends_7d?: number
          unsubs_7d?: number
          updated_at?: string
          warm_cap?: number
        }
        Update: {
          bounce_rate_7d?: number
          bounces_7d?: number
          clean_days?: number
          complaint_rate_7d?: number
          current_cap?: number
          gmail_email?: string | null
          last_measured_at?: string
          phase?: string
          profile_id?: string
          replies_7d?: number
          reply_rate_7d?: number
          sends_7d?: number
          unsubs_7d?: number
          updated_at?: string
          warm_cap?: number
        }
        Relationships: [
          {
            foreignKeyName: "sender_health_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_state: {
        Row: {
          deltas: Json
          excluded_gdpr: number
          feature_bucket: string
          meets: number
          model_version: string
          replied: number
          sent: number
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          deltas?: Json
          excluded_gdpr?: number
          feature_bucket: string
          meets?: number
          model_version: string
          replied?: number
          sent?: number
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          deltas?: Json
          excluded_gdpr?: number
          feature_bucket?: string
          meets?: number
          model_version?: string
          replied?: number
          sent?: number
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
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
          guest_id: string | null
          id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          guest_id?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          guest_id?: string | null
          id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
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
      thread_memory: {
        Row: {
          confidence: number | null
          created_at: string
          fact_kind: string
          id: string
          lead_id: string
          source_message_id: string | null
          source_ts: string | null
          superseded_at: string | null
          thread_id: string
          value: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          fact_kind: string
          id?: string
          lead_id: string
          source_message_id?: string | null
          source_ts?: string | null
          superseded_at?: string | null
          thread_id: string
          value: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          fact_kind?: string
          id?: string
          lead_id?: string
          source_message_id?: string | null
          source_ts?: string | null
          superseded_at?: string | null
          thread_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_memory_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thread_memory_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
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
      ai_cost_debit: {
        Args: {
          p_debit: number
          p_pool_daily: number
          p_pool_monthly: number
          p_profile_id: string
        }
        Returns: Json
      }
      ai_cost_guest_debit: {
        Args: { p_debit: number; p_pool_daily: number; p_pool_monthly: number }
        Returns: Json
      }
      ai_cost_guest_settle: { Args: { p_delta: number }; Returns: Json }
      ai_cost_settle: {
        Args: { p_delta: number; p_profile_id: string }
        Returns: Json
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
          priority: number
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
      delete_lead: {
        Args: { p_lead_id: string; p_user_id: string }
        Returns: Json
      }
      forget_lead: {
        Args: { p_lead_id: string; p_suppress?: boolean; p_user_id: string }
        Returns: Json
      }
      health_cron_evidence: {
        Args: never
        Returns: {
          failed_runs: number
          jobname: string
          last_run_event: string
          last_run_event_at: string
          last_start: string
          last_success: string
          schedule: string
        }[]
      }
      health_last_cron_runs: {
        Args: never
        Returns: {
          failed_runs: number
          jobname: string
          last_start: string
          last_success: string
          schedule: string
        }[]
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
      set_agent_config: {
        Args: {
          p_changed_by: string
          p_enabled: boolean
          p_key: string
          p_scope: string
          p_scope_id: string
          p_value: Json
        }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
