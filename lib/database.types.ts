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
  public: {
    Tables: {
      ai_review_feedback: {
        Row: {
          created_at: string
          helpful: boolean
          judge_id: string
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          helpful: boolean
          judge_id: string
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          helpful?: boolean
          judge_id?: string
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_review_feedback_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_review_feedback_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_review_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reviews: {
        Row: {
          generated_at: string
          improvements: string[]
          model: string
          process_notes: string | null
          strengths: string[]
          summary: string
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          generated_at?: string
          improvements: string[]
          model: string
          process_notes?: string | null
          strengths: string[]
          summary: string
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          generated_at?: string
          improvements?: string[]
          model?: string
          process_notes?: string | null
          strengths?: string[]
          summary?: string
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_reviews_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      alumni_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          kind: string
          tags: string[] | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          kind: string
          tags?: string[] | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          kind?: string
          tags?: string[] | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alumni_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alumni_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          message_id: string
          read_at: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_calls: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          model: string | null
          provider: string
          request_tokens: number | null
          response_tokens: number | null
          status_code: number | null
          team_id: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          provider: string
          request_tokens?: number | null
          response_tokens?: number | null
          status_code?: number | null
          team_id: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          provider?: string
          request_tokens?: number | null
          response_tokens?: number | null
          status_code?: number | null
          team_id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_calls_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_calls_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_results: {
        Row: {
          completed_at: string
          deviation: number | null
          judge_id: string
          sample_id: string
          scores: Json
          tenant_id: string | null
        }
        Insert: {
          completed_at?: string
          deviation?: number | null
          judge_id: string
          sample_id: string
          scores: Json
          tenant_id?: string | null
        }
        Update: {
          completed_at?: string
          deviation?: number | null
          judge_id?: string
          sample_id?: string
          scores?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calibration_results_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_results_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "calibration_samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_samples: {
        Row: {
          content: Json
          event_id: string
          id: string
          reference_scores: Json | null
          tenant_id: string | null
          title: string
        }
        Insert: {
          content: Json
          event_id: string
          id?: string
          reference_scores?: Json | null
          tenant_id?: string | null
          title: string
        }
        Update: {
          content?: Json
          event_id?: string
          id?: string
          reference_scores?: Json | null
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "calibration_samples_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calibration_samples_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_tracks: {
        Row: {
          brief: string
          event_id: string
          id: string
          judged_by_sponsor: boolean
          name: string
          prize_description: string | null
          sponsor_id: string | null
          tenant_id: string | null
        }
        Insert: {
          brief: string
          event_id: string
          id?: string
          judged_by_sponsor?: boolean
          name: string
          prize_description?: string | null
          sponsor_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          brief?: string
          event_id?: string
          id?: string
          judged_by_sponsor?: boolean
          name?: string
          prize_description?: string | null
          sponsor_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_tracks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_tracks_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_tracks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      check_ins: {
        Row: {
          author_id: string
          blockers: string | null
          body: string
          created_at: string
          id: string
          link_url: string | null
          milestone_id: string | null
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          author_id: string
          blockers?: string | null
          body: string
          created_at?: string
          id?: string
          link_url?: string | null
          milestone_id?: string | null
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          author_id?: string
          blockers?: string | null
          body?: string
          created_at?: string
          id?: string
          link_url?: string | null
          milestone_id?: string | null
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "check_ins_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commits: {
        Row: {
          additions: number | null
          author_login: string | null
          authored_at: string
          deletions: number | null
          files_changed: number | null
          id: string
          message: string | null
          sha: string
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          additions?: number | null
          author_login?: string | null
          authored_at: string
          deletions?: number | null
          files_changed?: number | null
          id?: string
          message?: string | null
          sha: string
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          additions?: number | null
          author_login?: string | null
          authored_at?: string
          deletions?: number | null
          files_changed?: number | null
          id?: string
          message?: string | null
          sha?: string
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commits_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_events: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_hash: string | null
          scopes: Json | null
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          scopes?: Json | null
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_hash?: string | null
          scopes?: Json | null
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consent_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_flags: {
        Row: {
          created_at: string
          event_id: string
          id: string
          judge_id: string
          note: string | null
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          judge_id: string
          note?: string | null
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          judge_id?: string
          note?: string | null
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discussion_flags_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_flags_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_flags_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discussion_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      erasure_requests: {
        Row: {
          completed_at: string | null
          id: string
          requested_at: string
          scope: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          requested_at?: string
          scope?: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          requested_at?: string
          scope?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erasure_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erasure_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invites: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          event_id: string
          expires_at: string
          id: string
          max_uses: number
          revoked_at: string | null
          role: string
          tenant_id: string | null
          token: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by: string
          email?: string | null
          event_id: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role: string
          tenant_id?: string | null
          token?: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          max_uses?: number
          revoked_at?: string | null
          role?: string
          tenant_id?: string | null
          token?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_invites_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      event_roles: {
        Row: {
          created_at: string
          event_id: string
          id: string
          role: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          role: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          role?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_roles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          cup_score_threshold: number | null
          ends_at: string
          id: string
          max_team_size: number
          name: string
          pairwise_blend: number
          pairwise_threshold: number
          slug: string
          starts_at: string
          status: string
          submission_deadline: string
          tagline: string | null
          tenant_id: string | null
          venue: string | null
          working_demo_required: boolean
        }
        Insert: {
          created_at?: string
          cup_score_threshold?: number | null
          ends_at: string
          id?: string
          max_team_size?: number
          name: string
          pairwise_blend?: number
          pairwise_threshold?: number
          slug: string
          starts_at: string
          status?: string
          submission_deadline: string
          tagline?: string | null
          tenant_id?: string | null
          venue?: string | null
          working_demo_required?: boolean
        }
        Update: {
          created_at?: string
          cup_score_threshold?: number | null
          ends_at?: string
          id?: string
          max_team_size?: number
          name?: string
          pairwise_blend?: number
          pairwise_threshold?: number
          slug?: string
          starts_at?: string
          status?: string
          submission_deadline?: string
          tagline?: string | null
          tenant_id?: string | null
          venue?: string | null
          working_demo_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      intro_requests: {
        Row: {
          context: string
          created_at: string
          id: string
          requester_id: string
          status: string
          target_id: string
          tenant_id: string | null
        }
        Insert: {
          context: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          target_id: string
          tenant_id?: string | null
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          target_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intro_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intro_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_assignments: {
        Row: {
          assigned_at: string
          event_id: string
          id: string
          judge_id: string
          status: string
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          assigned_at?: string
          event_id: string
          id?: string
          judge_id: string
          status?: string
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          assigned_at?: string
          event_id?: string
          id?: string
          judge_id?: string
          status?: string
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_conflicts: {
        Row: {
          declared_at: string
          judge_id: string
          reason: string | null
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          declared_at?: string
          judge_id: string
          reason?: string | null
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          declared_at?: string
          judge_id?: string
          reason?: string | null
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judge_conflicts_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_conflicts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_conflicts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          judge_id: string
          team_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          judge_id: string
          team_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          judge_id?: string
          team_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_notes_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_notes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      judge_reliability: {
        Row: {
          alpha: number
          beta: number
          event_id: string
          judge_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          alpha?: number
          beta?: number
          event_id: string
          judge_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          alpha?: number
          beta?: number
          event_id?: string
          judge_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_reliability_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_reliability_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_reliability_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_slots: {
        Row: {
          booked_at: string | null
          duration_min: number
          id: string
          mentor_id: string
          starts_at: string
          team_id: string | null
          tenant_id: string | null
        }
        Insert: {
          booked_at?: string | null
          duration_min?: number
          id?: string
          mentor_id: string
          starts_at: string
          team_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          booked_at?: string | null
          duration_min?: number
          id?: string
          mentor_id?: string
          starts_at?: string
          team_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentor_slots_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "mentors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_slots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentor_slots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mentors: {
        Row: {
          bio: string | null
          event_id: string
          expertise: string[] | null
          id: string
          name: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          event_id: string
          expertise?: string[] | null
          id?: string
          name: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          event_id?: string
          expertise?: string[] | null
          id?: string
          name?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mentors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mentors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel_type: string
          created_at: string
          event_id: string
          id: string
          sender_id: string
          team_id: string | null
          tenant_id: string | null
          urgent: boolean
        }
        Insert: {
          body: string
          channel_type: string
          created_at?: string
          event_id: string
          id?: string
          sender_id: string
          team_id?: string | null
          tenant_id?: string | null
          urgent?: boolean
        }
        Update: {
          body?: string
          channel_type?: string
          created_at?: string
          event_id?: string
          id?: string
          sender_id?: string
          team_id?: string | null
          tenant_id?: string | null
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      milestone_status: {
        Row: {
          check_in_id: string | null
          milestone_id: string
          satisfied_at: string | null
          status: string
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          check_in_id?: string | null
          milestone_id: string
          satisfied_at?: string | null
          status: string
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          check_in_id?: string | null
          milestone_id?: string
          satisfied_at?: string | null
          status?: string
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestone_status_check_in_id_fkey"
            columns: ["check_in_id"]
            isOneToOne: false
            referencedRelation: "check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_status_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_status_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestone_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          due_at: string
          event_id: string
          id: string
          key: string
          label: string
          penalty: string
          required: boolean
          sort_order: number
          tenant_id: string | null
        }
        Insert: {
          due_at: string
          event_id: string
          id?: string
          key: string
          label: string
          penalty?: string
          required?: boolean
          sort_order: number
          tenant_id?: string | null
        }
        Update: {
          due_at?: string
          event_id?: string
          id?: string
          key?: string
          label?: string
          penalty?: string
          required?: boolean
          sort_order?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pairwise_votes: {
        Row: {
          created_at: string
          event_id: string
          id: string
          judge_id: string
          loser_id: string
          tenant_id: string | null
          winner_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          judge_id: string
          loser_id: string
          tenant_id?: string | null
          winner_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          judge_id?: string
          loser_id?: string
          tenant_id?: string | null
          winner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairwise_votes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairwise_votes_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairwise_votes_loser_id_fkey"
            columns: ["loser_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairwise_votes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairwise_votes_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          course: string | null
          created_at: string
          email: string
          full_name: string | null
          github_username: string | null
          grad_year: number | null
          id: string
          skills: string[]
          tenant_id: string | null
          timezone: string
          university: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          course?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          github_username?: string | null
          grad_year?: number | null
          id: string
          skills?: string[]
          tenant_id?: string | null
          timezone?: string
          university?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          course?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          github_username?: string | null
          grad_year?: number | null
          id?: string
          skills?: string[]
          tenant_id?: string | null
          timezone?: string
          university?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiter_access_log: {
        Row: {
          id: string
          org_id: string
          recruiter_id: string
          tenant_id: string | null
          viewed_at: string
          viewed_user_id: string
        }
        Insert: {
          id?: string
          org_id: string
          recruiter_id: string
          tenant_id?: string | null
          viewed_at?: string
          viewed_user_id: string
        }
        Update: {
          id?: string
          org_id?: string
          recruiter_id?: string
          tenant_id?: string | null
          viewed_at?: string
          viewed_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recruiter_access_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "recruiter_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_access_log_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_access_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recruiter_access_log_viewed_user_id_fkey"
            columns: ["viewed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruiter_orgs: {
        Row: {
          access_expires_at: string | null
          domain: string | null
          dpa_signed_at: string | null
          hiring_intent: string
          id: string
          name: string
          tenant_id: string | null
        }
        Insert: {
          access_expires_at?: string | null
          domain?: string | null
          dpa_signed_at?: string | null
          hiring_intent: string
          id?: string
          name: string
          tenant_id?: string | null
        }
        Update: {
          access_expires_at?: string | null
          domain?: string | null
          dpa_signed_at?: string | null
          hiring_intent?: string
          id?: string
          name?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruiter_orgs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          bracket: string | null
          final_rank: number | null
          pairwise_rank: number | null
          published: boolean
          rubric_score: number | null
          team_id: string
          tenant_id: string | null
        }
        Insert: {
          bracket?: string | null
          final_rank?: number | null
          pairwise_rank?: number | null
          published?: boolean
          rubric_score?: number | null
          team_id: string
          tenant_id?: string | null
        }
        Update: {
          bracket?: string | null
          final_rank?: number | null
          pairwise_rank?: number | null
          published?: boolean
          rubric_score?: number | null
          team_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "results_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rubric_criteria: {
        Row: {
          description: string
          event_id: string
          id: string
          key: string
          label: string
          scale_max: number
          sort_order: number
          tenant_id: string | null
          weight: number
        }
        Insert: {
          description: string
          event_id: string
          id?: string
          key: string
          label: string
          scale_max?: number
          sort_order: number
          tenant_id?: string | null
          weight: number
        }
        Update: {
          description?: string
          event_id?: string
          id?: string
          key?: string
          label?: string
          scale_max?: number
          sort_order?: number
          tenant_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubric_criteria_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rubric_criteria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_items: {
        Row: {
          description: string | null
          ends_at: string | null
          event_id: string
          id: string
          kind: string
          location: string | null
          starts_at: string
          tenant_id: string | null
          title: string
        }
        Insert: {
          description?: string | null
          ends_at?: string | null
          event_id: string
          id?: string
          kind?: string
          location?: string | null
          starts_at: string
          tenant_id?: string | null
          title: string
        }
        Update: {
          description?: string | null
          ends_at?: string | null
          event_id?: string
          id?: string
          kind?: string
          location?: string | null
          starts_at?: string
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          comment: string | null
          created_at: string
          criterion_id: string
          id: string
          judge_id: string
          phase: string
          team_id: string
          tenant_id: string | null
          updated_at: string
          value: number
        }
        Insert: {
          comment?: string | null
          created_at?: string
          criterion_id: string
          id?: string
          judge_id: string
          phase?: string
          team_id: string
          tenant_id?: string | null
          updated_at?: string
          value: number
        }
        Update: {
          comment?: string | null
          created_at?: string
          criterion_id?: string
          id?: string
          judge_id?: string
          phase?: string
          team_id?: string
          tenant_id?: string | null
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "scores_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "rubric_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_judge_id_fkey"
            columns: ["judge_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          event_id: string
          id: string
          logo_url: string | null
          name: string
          tenant_id: string | null
          tier: string | null
          website_url: string | null
        }
        Insert: {
          event_id: string
          id?: string
          logo_url?: string | null
          name: string
          tenant_id?: string | null
          tier?: string | null
          website_url?: string | null
        }
        Update: {
          event_id?: string
          id?: string
          logo_url?: string | null
          name?: string
          tenant_id?: string | null
          tier?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_profiles: {
        Row: {
          consent_expires_at: string | null
          consent_given_at: string | null
          consent_scopes: Json | null
          headline: string | null
          last_reviewed_at: string | null
          open_to: string[]
          tenant_id: string | null
          user_id: string
          visibility: string
        }
        Insert: {
          consent_expires_at?: string | null
          consent_given_at?: string | null
          consent_scopes?: Json | null
          headline?: string | null
          last_reviewed_at?: string | null
          open_to?: string[]
          tenant_id?: string | null
          user_id: string
          visibility?: string
        }
        Update: {
          consent_expires_at?: string | null
          consent_given_at?: string | null
          consent_scopes?: Json | null
          headline?: string | null
          last_reviewed_at?: string | null
          open_to?: string[]
          tenant_id?: string | null
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          role: string
          team_id: string
          tenant_id: string | null
          user_id: string
        }
        Insert: {
          joined_at?: string
          role?: string
          team_id: string
          tenant_id?: string | null
          user_id: string
        }
        Update: {
          joined_at?: string
          role?: string
          team_id?: string
          tenant_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_ratings: {
        Row: {
          comparison_count: number
          mu: number
          sigma_sq: number
          team_id: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          comparison_count?: number
          mu?: number
          sigma_sq?: number
          team_id: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          comparison_count?: number
          mu?: number
          sigma_sq?: number
          team_id?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_ratings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_ratings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_tracks: {
        Row: {
          team_id: string
          tenant_id: string | null
          track_id: string
        }
        Insert: {
          team_id: string
          tenant_id?: string | null
          track_id: string
        }
        Update: {
          team_id?: string
          tenant_id?: string | null
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_tracks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_tracks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_tracks_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "challenge_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          bracket: string
          created_at: string
          description: string | null
          event_id: string
          id: string
          invite_code: string
          name: string
          project_name: string | null
          proxy_token: string
          repo_created_at: string | null
          repo_url: string | null
          submission_idempotency_key: string | null
          submitted_at: string | null
          tenant_id: string | null
          video_url: string | null
        }
        Insert: {
          bracket?: string
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          invite_code?: string
          name: string
          project_name?: string | null
          proxy_token?: string
          repo_created_at?: string | null
          repo_url?: string | null
          submission_idempotency_key?: string | null
          submitted_at?: string | null
          tenant_id?: string | null
          video_url?: string | null
        }
        Update: {
          bracket?: string
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          invite_code?: string
          name?: string
          project_name?: string | null
          proxy_token?: string
          repo_created_at?: string | null
          repo_url?: string | null
          submission_idempotency_key?: string | null
          submitted_at?: string | null
          tenant_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_event_id_for_team: { Args: { p_team: string }; Returns: string }
      auth_has_event_role: {
        Args: { p_event: string; p_role: string }
        Returns: boolean
      }
      auth_is_alumnus: { Args: never; Returns: boolean }
      auth_is_assigned_judge: { Args: { p_team: string }; Returns: boolean }
      auth_is_captain: { Args: { p_team: string }; Returns: boolean }
      auth_is_staff: { Args: { p_event: string }; Returns: boolean }
      auth_is_team_member: { Args: { p_team: string }; Returns: boolean }
      auth_recruiter_org_id: { Args: never; Returns: string }
      auth_team_ids: { Args: never; Returns: string[] }
      accept_invite: {
        Args: { p_token: string }
        Returns: {
          granted: boolean
          reason: string
          out_event_id: string | null
          out_role: string | null
        }[]
      }
      preview_invite: {
        Args: { p_token: string }
        Returns: {
          valid: boolean
          reason: string
          event_name: string | null
          role: string | null
        }[]
      }
      list_pairwise_candidates: {
        Args: { p_event_id: string }
        Returns: {
          id: string
          name: string
          project_name: string | null
          mu: number
          sigma_sq: number
          comparison_count: number
        }[]
      }
      submit_team: {
        Args: { p_team_id: string; p_idempotency_key: string }
        Returns: Json
      }
      view_alumni_profile: { Args: { p_user_id: string }; Returns: Json }
      view_talent_profile: { Args: { p_user_id: string }; Returns: Json }
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
