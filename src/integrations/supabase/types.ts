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
      admin_actions: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_action_state: {
        Row: {
          conversation_id: string
          message_id: string | null
          updated_at: string
          used_in_conversation: number
          used_in_message: number
        }
        Insert: {
          conversation_id: string
          message_id?: string | null
          updated_at?: string
          used_in_conversation?: number
          used_in_message?: number
        }
        Update: {
          conversation_id?: string
          message_id?: string | null
          updated_at?: string
          used_in_conversation?: number
          used_in_message?: number
        }
        Relationships: []
      }
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
      agent_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_learned_phrases: {
        Row: {
          correct: number
          created_at: string
          id: number
          intent: string
          last_used_at: string
          params: Json
          phrase: string
          scope: string
          state: string
          user_id: string
          uses: number
        }
        Insert: {
          correct?: number
          created_at?: string
          id?: never
          intent: string
          last_used_at?: string
          params?: Json
          phrase: string
          scope?: string
          state?: string
          user_id: string
          uses?: number
        }
        Update: {
          correct?: number
          created_at?: string
          id?: never
          intent?: string
          last_used_at?: string
          params?: Json
          phrase?: string
          scope?: string
          state?: string
          user_id?: string
          uses?: number
        }
        Relationships: []
      }
      agent_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          executed_at: string | null
          id: string
          intent: string | null
          params: Json | null
          role: string
          used_ai: boolean
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          executed_at?: string | null
          id?: string
          intent?: string | null
          params?: Json | null
          role: string
          used_ai?: boolean
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          executed_at?: string | null
          id?: string
          intent?: string | null
          params?: Json | null
          role?: string
          used_ai?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pending_state: {
        Row: {
          asked_at: string
          conversation_id: string
          intent: string
          params: Json
          user_id: string
        }
        Insert: {
          asked_at?: string
          conversation_id: string
          intent: string
          params?: Json
          user_id: string
        }
        Update: {
          asked_at?: string
          conversation_id?: string
          intent?: string
          params?: Json
          user_id?: string
        }
        Relationships: []
      }
      agent_profile: {
        Row: {
          audience: string | null
          business_name: string | null
          goals: string | null
          notes: string | null
          product: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          audience?: string | null
          business_name?: string | null
          goals?: string | null
          notes?: string | null
          product?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          audience?: string | null
          business_name?: string | null
          goals?: string | null
          notes?: string | null
          product?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
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
      billing_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          currency: string | null
          event: string
          id: string
          payload: Json
          payment_id: string | null
          plan: string | null
          user_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          event: string
          id?: string
          payload?: Json
          payment_id?: string | null
          plan?: string | null
          user_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          currency?: string | null
          event?: string
          id?: string
          payload?: Json
          payment_id?: string | null
          plan?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      demo_rate_limit: {
        Row: {
          action: string
          created_at: string
          id: number
          ip: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: number
          ip: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: number
          ip?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          user_id: string
          verification_token: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          user_id: string
          verification_token: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          user_id?: string
          verification_token?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "domains_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          opener_key: string | null
          replied: boolean
          reply_sentiment: string | null
          reply_style: string | null
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
          opener_key?: string | null
          replied?: boolean
          reply_sentiment?: string | null
          reply_style?: string | null
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
          opener_key?: string | null
          replied?: boolean
          reply_sentiment?: string | null
          reply_style?: string | null
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
      google_search_usage: {
        Row: {
          count: number
          day: string
          updated_at: string
        }
        Insert: {
          count?: number
          day: string
          updated_at?: string
        }
        Update: {
          count?: number
          day?: string
          updated_at?: string
        }
        Relationships: []
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
      inbound_emails: {
        Row: {
          body_html: string | null
          body_text: string | null
          campaign_id: string | null
          content_hash: string | null
          created_at: string
          from_email: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          subject: string | null
          to_email: string | null
          user_id: string
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          campaign_id?: string | null
          content_hash?: string | null
          created_at?: string
          from_email?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          subject?: string | null
          to_email?: string | null
          user_id: string
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          campaign_id?: string | null
          content_hash?: string | null
          created_at?: string
          from_email?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          subject?: string | null
          to_email?: string | null
          user_id?: string
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
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          failure_reason: string | null
          id: string
          idempotency_key: string | null
          method: string | null
          notes: Json
          paid_at: string | null
          plan: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string | null
          notes?: Json
          paid_at?: string | null
          plan: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string | null
          method?: string | null
          notes?: Json
          paid_at?: string | null
          plan?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          campaigns: number | null
          daily_emails: number
          leads: number | null
          lifetime_emails: number | null
          plan: string
        }
        Insert: {
          campaigns?: number | null
          daily_emails: number
          leads?: number | null
          lifetime_emails?: number | null
          plan: string
        }
        Update: {
          campaigns?: number | null
          daily_emails?: number
          leads?: number | null
          lifetime_emails?: number | null
          plan?: string
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
          business_address: string | null
          business_description: string | null
          cities: string[] | null
          communication_style: string | null
          company: string | null
          created_at: string
          domain_required: boolean
          domain_verified: boolean
          dont_claim: string | null
          email: string | null
          emails_sent_date: string | null
          emails_sent_today: number
          emails_sent_total: number
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
          review_mode: string
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
          business_address?: string | null
          business_description?: string | null
          cities?: string[] | null
          communication_style?: string | null
          company?: string | null
          created_at?: string
          domain_required?: boolean
          domain_verified?: boolean
          dont_claim?: string | null
          email?: string | null
          emails_sent_date?: string | null
          emails_sent_today?: number
          emails_sent_total?: number
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
          review_mode?: string
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
          business_address?: string | null
          business_description?: string | null
          cities?: string[] | null
          communication_style?: string | null
          company?: string | null
          created_at?: string
          domain_required?: boolean
          domain_verified?: boolean
          dont_claim?: string | null
          email?: string | null
          emails_sent_date?: string | null
          emails_sent_today?: number
          emails_sent_total?: number
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
          review_mode?: string
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
          email_crawl_at: string | null
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
          email_crawl_at?: string | null
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
          email_crawl_at?: string | null
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
          draft_body: string | null
          draft_meta: Json | null
          draft_subject: string | null
          id: string
          last_error: string | null
          lead_id: string
          lease_until: string | null
          next_retry_at: string | null
          priority: number
          review_state: string | null
          status: string
          updated_at: string | null
          user_id: string
          variant: string | null
        }
        Insert: {
          attempts?: number
          campaign_id: string
          created_at?: string
          draft_body?: string | null
          draft_meta?: Json | null
          draft_subject?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          lease_until?: string | null
          next_retry_at?: string | null
          priority?: number
          review_state?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
          variant?: string | null
        }
        Update: {
          attempts?: number
          campaign_id?: string
          created_at?: string
          draft_body?: string | null
          draft_meta?: Json | null
          draft_subject?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          lease_until?: string | null
          next_retry_at?: string | null
          priority?: number
          review_state?: string | null
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
      signup_signals: {
        Row: {
          created_at: string
          device_id: string | null
          id: string
          ip_hash: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          id?: string
          ip_hash?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      opener_performance: {
        Row: {
          campaign_id: string | null
          opener_key: string | null
          replied: number | null
          reply_rate: number | null
          sent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_sent_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      reply_style_performance: {
        Row: {
          campaign_id: string | null
          conversations: number | null
          meetings: number | null
          reply_style: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_sent_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_clear_flag: {
        Args: { p_note?: string; p_user: string }
        Returns: undefined
      }
      admin_console: { Args: never; Returns: Json }
      admin_flag: {
        Args: { p_note?: string; p_user: string }
        Returns: undefined
      }
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
      bump_google_search_usage: { Args: { p_cost: number }; Returns: number }
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
          draft_body: string | null
          draft_meta: Json | null
          draft_subject: string | null
          id: string
          last_error: string | null
          lead_id: string
          lease_until: string | null
          next_retry_at: string | null
          priority: number
          review_state: string | null
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
      effective_plan: { Args: { p_user: string }; Returns: string }
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
      is_admin: { Args: never; Returns: boolean }
      is_plausible_business_address: {
        Args: { p_address: string }
        Returns: boolean
      }
      normalize_business_text: { Args: { p_value: string }; Returns: string }
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
      send_block_reason: { Args: { p_user: string }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
