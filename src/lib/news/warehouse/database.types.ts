export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      candidate_ingestion_events: {
        Row: {
          candidate_id: string
          created_candidate: boolean
          id: number
          ingestion_run_id: string
          observed_at: string
          provider_id: number
          provider_item_id: string | null
          published_at: string | null
          unit_key: string
        }
        Insert: {
          candidate_id: string
          created_candidate?: boolean
          id?: never
          ingestion_run_id: string
          observed_at?: string
          provider_id: number
          provider_item_id?: string | null
          published_at?: string | null
          unit_key?: string
        }
        Update: {
          candidate_id?: string
          created_candidate?: boolean
          id?: never
          ingestion_run_id?: string
          observed_at?: string
          provider_id?: number
          provider_item_id?: string | null
          published_at?: string | null
          unit_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_ingestion_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "candidate_ingestion_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_ingestion_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "candidate_ingestion_events_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_ingestion_events_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "news_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_rejections: {
        Row: {
          fingerprint: string
          first_rejected_at: string
          first_run_id: string
          headline: string
          id: number
          last_run_id: string
          last_seen_at: string
          provider_id: number
          publisher_domain: string
          reasons: string[]
          source_id: number | null
          source_url: string
          sport: string | null
          times_seen: number
        }
        Insert: {
          fingerprint: string
          first_rejected_at?: string
          first_run_id: string
          headline: string
          id?: never
          last_run_id: string
          last_seen_at?: string
          provider_id: number
          publisher_domain: string
          reasons: string[]
          source_id?: number | null
          source_url: string
          sport?: string | null
          times_seen?: number
        }
        Update: {
          fingerprint?: string
          first_rejected_at?: string
          first_run_id?: string
          headline?: string
          id?: never
          last_run_id?: string
          last_seen_at?: string
          provider_id?: number
          publisher_domain?: string
          reasons?: string[]
          source_id?: number | null
          source_url?: string
          sport?: string | null
          times_seen?: number
        }
        Relationships: [
          {
            foreignKeyName: "candidate_rejections_first_run_id_fkey"
            columns: ["first_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_rejections_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_rejections_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "news_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_rejections_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      clustering_runs: {
        Row: {
          algorithm_version: string
          ambiguous_count: number
          candidates_considered: number
          clusters_created: number
          error_message: string | null
          finished_at: string | null
          id: string
          joined_existing: number
          memberships_created: number
          metadata: Json
          sport_filter: string | null
          started_at: string
          status: string
          trigger: string
          window_label: string | null
        }
        Insert: {
          algorithm_version: string
          ambiguous_count?: number
          candidates_considered?: number
          clusters_created?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          joined_existing?: number
          memberships_created?: number
          metadata?: Json
          sport_filter?: string | null
          started_at?: string
          status?: string
          trigger?: string
          window_label?: string | null
        }
        Update: {
          algorithm_version?: string
          ambiguous_count?: number
          candidates_considered?: number
          clusters_created?: number
          error_message?: string | null
          finished_at?: string | null
          id?: string
          joined_existing?: number
          memberships_created?: number
          metadata?: Json
          sport_filter?: string | null
          started_at?: string
          status?: string
          trigger?: string
          window_label?: string | null
        }
        Relationships: []
      }
      editorial_events: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: Json
          editorial_item_id: string
          id: number
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          detail?: Json
          editorial_item_id: string
          id?: never
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: Json
          editorial_item_id?: string
          id?: never
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_events_editorial_item_id_fkey"
            columns: ["editorial_item_id"]
            isOneToOne: false
            referencedRelation: "editorial_items"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_items: {
        Row: {
          active_overrides: Json
          algorithm_version: string | null
          candidate_count: number
          cluster_confidence: string | null
          cluster_id: string
          created_at: string
          dek: string | null
          editorial_priority: number
          editorial_score: number
          eligibility: string
          eligibility_reasons: Json
          entities: string[]
          event_type: string | null
          first_published_at: string | null
          first_seen_at: string | null
          headline: string | null
          id: string
          image_status: string
          last_published_at: string | null
          last_ranked_at: string | null
          last_seen_at: string | null
          league: string | null
          provider_count: number
          rank_position: number | null
          ranking_run_id: string | null
          representative_candidate_id: string | null
          score_parts: Json
          section: string | null
          section_eligibility: Json
          source_count: number
          sport: string
          status: string
          updated_at: string
          urgency: string
        }
        Insert: {
          active_overrides?: Json
          algorithm_version?: string | null
          candidate_count?: number
          cluster_confidence?: string | null
          cluster_id: string
          created_at?: string
          dek?: string | null
          editorial_priority?: number
          editorial_score?: number
          eligibility?: string
          eligibility_reasons?: Json
          entities?: string[]
          event_type?: string | null
          first_published_at?: string | null
          first_seen_at?: string | null
          headline?: string | null
          id?: string
          image_status?: string
          last_published_at?: string | null
          last_ranked_at?: string | null
          last_seen_at?: string | null
          league?: string | null
          provider_count?: number
          rank_position?: number | null
          ranking_run_id?: string | null
          representative_candidate_id?: string | null
          score_parts?: Json
          section?: string | null
          section_eligibility?: Json
          source_count?: number
          sport: string
          status?: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          active_overrides?: Json
          algorithm_version?: string | null
          candidate_count?: number
          cluster_confidence?: string | null
          cluster_id?: string
          created_at?: string
          dek?: string | null
          editorial_priority?: number
          editorial_score?: number
          eligibility?: string
          eligibility_reasons?: Json
          entities?: string[]
          event_type?: string | null
          first_published_at?: string | null
          first_seen_at?: string | null
          headline?: string | null
          id?: string
          image_status?: string
          last_published_at?: string | null
          last_ranked_at?: string | null
          last_seen_at?: string | null
          league?: string | null
          provider_count?: number
          rank_position?: number | null
          ranking_run_id?: string | null
          representative_candidate_id?: string | null
          score_parts?: Json
          section?: string | null
          section_eligibility?: Json
          source_count?: number
          sport?: string
          status?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_items_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: true
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "editorial_items_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: true
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_items_ranking_run_id_fkey"
            columns: ["ranking_run_id"]
            isOneToOne: false
            referencedRelation: "editorial_ranking_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_items_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "editorial_items_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_items_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
      editorial_overrides: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string
          editorial_item_id: string
          id: number
          kind: string
          reason: string | null
          removed_at: string | null
          removed_by: string | null
          removed_reason: string | null
          text_value: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by?: string
          editorial_item_id: string
          id?: never
          kind: string
          reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          text_value?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string
          editorial_item_id?: string
          id?: never
          kind?: string
          reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          removed_reason?: string | null
          text_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_overrides_editorial_item_id_fkey"
            columns: ["editorial_item_id"]
            isOneToOne: false
            referencedRelation: "editorial_items"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_ranking_runs: {
        Row: {
          algorithm_version: string
          clusters_considered: number
          eligible_count: number
          error_message: string | null
          finished_at: string | null
          held_count: number
          id: string
          items_created: number
          items_updated: number
          metadata: Json
          review_count: number
          sport_filter: string | null
          started_at: string
          status: string
          trigger: string
          window_label: string | null
        }
        Insert: {
          algorithm_version: string
          clusters_considered?: number
          eligible_count?: number
          error_message?: string | null
          finished_at?: string | null
          held_count?: number
          id?: string
          items_created?: number
          items_updated?: number
          metadata?: Json
          review_count?: number
          sport_filter?: string | null
          started_at?: string
          status?: string
          trigger?: string
          window_label?: string | null
        }
        Update: {
          algorithm_version?: string
          clusters_considered?: number
          eligible_count?: number
          error_message?: string | null
          finished_at?: string | null
          held_count?: number
          id?: string
          items_created?: number
          items_updated?: number
          metadata?: Json
          review_count?: number
          sport_filter?: string | null
          started_at?: string
          status?: string
          trigger?: string
          window_label?: string | null
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          error_message: string | null
          finished_at: string | null
          id: string
          metadata: Json
          observations_created: number
          provider_id: number
          provider_state: string | null
          records_accepted: number
          records_duplicate_headline: number
          records_duplicate_url: number
          records_inserted: number
          records_rejected: number
          records_returned: number
          sources_created: number
          started_at: string
          status: string
          trigger: string
          units_processed: number
          units_skipped: number
          window_label: string | null
        }
        Insert: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          observations_created?: number
          provider_id: number
          provider_state?: string | null
          records_accepted?: number
          records_duplicate_headline?: number
          records_duplicate_url?: number
          records_inserted?: number
          records_rejected?: number
          records_returned?: number
          sources_created?: number
          started_at?: string
          status?: string
          trigger?: string
          units_processed?: number
          units_skipped?: number
          window_label?: string | null
        }
        Update: {
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          observations_created?: number
          provider_id?: number
          provider_state?: string | null
          records_accepted?: number
          records_duplicate_headline?: number
          records_duplicate_url?: number
          records_inserted?: number
          records_rejected?: number
          records_returned?: number
          sources_created?: number
          started_at?: string
          status?: string
          trigger?: string
          units_processed?: number
          units_skipped?: number
          window_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingestion_runs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "news_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      news_candidates: {
        Row: {
          classification_confidence: string
          classification_signals: Json
          created_at: string
          discovered_at: string
          fingerprint: string
          headline: string
          headline_kind: string
          headline_primary_id: string | null
          id: string
          language: string | null
          league: string | null
          normalized_headline: string
          normalized_source_url: string
          provider_categories: Json | null
          provider_id: number
          provider_item_id: string | null
          published_at: string | null
          query_profile: string | null
          remote_image_ref: string | null
          source_id: number
          source_quality: string
          source_url: string
          sport: string
          status: string
          updated_at: string
        }
        Insert: {
          classification_confidence: string
          classification_signals?: Json
          created_at?: string
          discovered_at: string
          fingerprint: string
          headline: string
          headline_kind?: string
          headline_primary_id?: string | null
          id?: string
          language?: string | null
          league?: string | null
          normalized_headline: string
          normalized_source_url: string
          provider_categories?: Json | null
          provider_id: number
          provider_item_id?: string | null
          published_at?: string | null
          query_profile?: string | null
          remote_image_ref?: string | null
          source_id: number
          source_quality: string
          source_url: string
          sport: string
          status?: string
          updated_at?: string
        }
        Update: {
          classification_confidence?: string
          classification_signals?: Json
          created_at?: string
          discovered_at?: string
          fingerprint?: string
          headline?: string
          headline_kind?: string
          headline_primary_id?: string | null
          id?: string
          language?: string | null
          league?: string | null
          normalized_headline?: string
          normalized_source_url?: string
          provider_categories?: Json | null
          provider_id?: number
          provider_item_id?: string | null
          published_at?: string | null
          query_profile?: string | null
          remote_image_ref?: string | null
          source_id?: number
          source_quality?: string
          source_url?: string
          sport?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_candidates_headline_primary_id_fkey"
            columns: ["headline_primary_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "news_candidates_headline_primary_id_fkey"
            columns: ["headline_primary_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_candidates_headline_primary_id_fkey"
            columns: ["headline_primary_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "news_candidates_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "news_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_candidates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "news_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      news_ingestion_units: {
        Row: {
          candidates_inserted: number
          candidates_received: number
          id: number
          ingestion_run_id: string
          processed_at: string
          provider_id: number
          unit_key: string
        }
        Insert: {
          candidates_inserted?: number
          candidates_received?: number
          id?: never
          ingestion_run_id: string
          processed_at?: string
          provider_id: number
          unit_key: string
        }
        Update: {
          candidates_inserted?: number
          candidates_received?: number
          id?: never
          ingestion_run_id?: string
          processed_at?: string
          provider_id?: number
          unit_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_ingestion_units_ingestion_run_id_fkey"
            columns: ["ingestion_run_id"]
            isOneToOne: false
            referencedRelation: "ingestion_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_ingestion_units_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "news_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      news_providers: {
        Row: {
          created_at: string
          display_name: string
          expected_freshness: string
          id: number
          policy_status: string
          provider_key: string
          requires_api_key: boolean
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          expected_freshness: string
          id?: never
          policy_status: string
          provider_key: string
          requires_api_key?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          expected_freshness?: string
          id?: never
          policy_status?: string
          provider_key?: string
          requires_api_key?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          created_at: string
          display_name: string
          domain: string
          id: number
          is_enabled: boolean
          quality_bucket: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          domain: string
          id?: never
          is_enabled?: boolean
          quality_bucket?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          domain?: string
          id?: never
          is_enabled?: boolean
          quality_bucket?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsroom_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          holder: string
          lock_key: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          holder: string
          lock_key: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          holder?: string
          lock_key?: string
        }
        Relationships: []
      }
      story_cluster_ambiguities: {
        Row: {
          candidate_id: string
          cluster_id: string
          clustering_run_id: string | null
          confidence: string
          created_at: string
          dismissed_at: string | null
          evidence: Json
          id: number
          reason: string
          score: number
        }
        Insert: {
          candidate_id: string
          cluster_id: string
          clustering_run_id?: string | null
          confidence: string
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          id?: never
          reason: string
          score: number
        }
        Update: {
          candidate_id?: string
          cluster_id?: string
          clustering_run_id?: string | null
          confidence?: string
          created_at?: string
          dismissed_at?: string | null
          evidence?: Json
          id?: never
          reason?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_cluster_ambiguities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_clustering_run_id_fkey"
            columns: ["clustering_run_id"]
            isOneToOne: false
            referencedRelation: "clustering_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      story_cluster_members: {
        Row: {
          candidate_id: string
          cluster_id: string
          clustering_run_id: string | null
          confidence: string
          entities: string[]
          event_type: string | null
          evidence: Json
          joined_at: string
          match_method: string
          match_score: number
          merged_from_cluster_id: string | null
        }
        Insert: {
          candidate_id: string
          cluster_id: string
          clustering_run_id?: string | null
          confidence: string
          entities?: string[]
          event_type?: string | null
          evidence?: Json
          joined_at?: string
          match_method: string
          match_score: number
          merged_from_cluster_id?: string | null
        }
        Update: {
          candidate_id?: string
          cluster_id?: string
          clustering_run_id?: string | null
          confidence?: string
          entities?: string[]
          event_type?: string | null
          evidence?: Json
          joined_at?: string
          match_method?: string
          match_score?: number
          merged_from_cluster_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_cluster_members_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_cluster_members_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_members_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_members_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_members_clustering_run_id_fkey"
            columns: ["clustering_run_id"]
            isOneToOne: false
            referencedRelation: "clustering_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_members_merged_from_cluster_id_fkey"
            columns: ["merged_from_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_members_merged_from_cluster_id_fkey"
            columns: ["merged_from_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      story_cluster_merges: {
        Row: {
          from_candidate_count: number
          from_cluster_id: string
          from_source_count: number
          id: number
          into_cluster_id: string
          members_moved: number
          merged_at: string
          reason: string | null
        }
        Insert: {
          from_candidate_count: number
          from_cluster_id: string
          from_source_count: number
          id?: never
          into_cluster_id: string
          members_moved: number
          merged_at?: string
          reason?: string | null
        }
        Update: {
          from_candidate_count?: number
          from_cluster_id?: string
          from_source_count?: number
          id?: never
          into_cluster_id?: string
          members_moved?: number
          merged_at?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_cluster_merges_from_cluster_id_fkey"
            columns: ["from_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_merges_from_cluster_id_fkey"
            columns: ["from_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_merges_into_cluster_id_fkey"
            columns: ["into_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_merges_into_cluster_id_fkey"
            columns: ["into_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
      story_clusters: {
        Row: {
          candidate_count: number
          canonical_headline: string | null
          confidence: string
          created_at: string
          event_type: string | null
          first_published_at: string | null
          first_seen_at: string
          id: string
          last_published_at: string | null
          last_seen_at: string
          league: string | null
          merged_into_id: string | null
          provider_count: number
          representative_candidate_id: string | null
          source_count: number
          sport: string
          status: string
          updated_at: string
        }
        Insert: {
          candidate_count?: number
          canonical_headline?: string | null
          confidence?: string
          created_at?: string
          event_type?: string | null
          first_published_at?: string | null
          first_seen_at: string
          id?: string
          last_published_at?: string | null
          last_seen_at: string
          league?: string | null
          merged_into_id?: string | null
          provider_count?: number
          representative_candidate_id?: string | null
          source_count?: number
          sport: string
          status?: string
          updated_at?: string
        }
        Update: {
          candidate_count?: number
          canonical_headline?: string | null
          confidence?: string
          created_at?: string
          event_type?: string | null
          first_published_at?: string | null
          first_seen_at?: string
          id?: string
          last_published_at?: string | null
          last_seen_at?: string
          league?: string | null
          merged_into_id?: string | null
          provider_count?: number
          representative_candidate_id?: string | null
          source_count?: number
          sport?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_clusters_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_clusters_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_clusters_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_clusters_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_clusters_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
    }
    Views: {
      news_candidate_feed: {
        Row: {
          candidate_id: string | null
          classification_confidence: string | null
          classification_signals: Json | null
          discovered_at: string | null
          discovery_text: string | null
          fresh_at: string | null
          headline_kind: string | null
          headline_primary_id: string | null
          language: string | null
          league: string | null
          normalized_headline: string | null
          provider_key: string | null
          published_at: string | null
          publisher_headline: string | null
          query_profile: string | null
          source_domain: string | null
          source_enabled: boolean | null
          source_name: string | null
          source_quality: string | null
          source_url: string | null
          sport: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_candidates_headline_primary_id_fkey"
            columns: ["headline_primary_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "news_candidates_headline_primary_id_fkey"
            columns: ["headline_primary_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_candidates_headline_primary_id_fkey"
            columns: ["headline_primary_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
      news_headline_groups: {
        Row: {
          candidate_count: number | null
          first_published_at: string | null
          first_seen_at: string | null
          headline_kind: string | null
          last_published_at: string | null
          last_seen_at: string | null
          normalized_headline: string | null
          provider_count: number | null
          root_candidate_id: string | null
          sample_headline: string | null
          source_count: number | null
          sport: string | null
          sports: string[] | null
        }
        Relationships: []
      }
      news_unclustered_candidates: {
        Row: {
          candidate_id: string | null
          discovered_at: string | null
          fresh_at: string | null
          headline_kind: string | null
          sport: string | null
        }
        Insert: {
          candidate_id?: string | null
          discovered_at?: string | null
          fresh_at?: never
          headline_kind?: string | null
          sport?: string | null
        }
        Update: {
          candidate_id?: string | null
          discovered_at?: string | null
          fresh_at?: never
          headline_kind?: string | null
          sport?: string | null
        }
        Relationships: []
      }
      story_cluster_feed: {
        Row: {
          candidate_count: number | null
          canonical_headline: string | null
          cluster_id: string | null
          confidence: string | null
          entities: string[] | null
          event_type: string | null
          first_published_at: string | null
          first_seen_at: string | null
          fresh_at: string | null
          last_published_at: string | null
          last_seen_at: string | null
          league: string | null
          provider_count: number | null
          representative_candidate_id: string | null
          representative_domain: string | null
          representative_source: string | null
          representative_url: string | null
          source_count: number | null
          sport: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_clusters_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_clusters_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_clusters_representative_candidate_id_fkey"
            columns: ["representative_candidate_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
        ]
      }
      story_cluster_review_queue: {
        Row: {
          ambiguity_id: number | null
          candidate_id: string | null
          confidence: string | null
          created_at: string | null
          current_cluster_id: string | null
          evidence: Json | null
          reason: string | null
          score: number | null
          suggested_cluster_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_cluster_ambiguities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidate_feed"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "news_unclustered_candidates"
            referencedColumns: ["candidate_id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_cluster_id_fkey"
            columns: ["suggested_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_ambiguities_cluster_id_fkey"
            columns: ["suggested_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_cluster_members_cluster_id_fkey"
            columns: ["current_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_cluster_feed"
            referencedColumns: ["cluster_id"]
          },
          {
            foreignKeyName: "story_cluster_members_cluster_id_fkey"
            columns: ["current_cluster_id"]
            isOneToOne: false
            referencedRelation: "story_clusters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      editorial_finish_rank: { Args: { p_run_id: string }; Returns: Json }
      editorial_remove_override: {
        Args: {
          p_actor?: string
          p_item: string
          p_kind: string
          p_reason?: string
        }
        Returns: number
      }
      editorial_set_override: {
        Args: {
          p_actor?: string
          p_amount?: number
          p_item: string
          p_kind: string
          p_reason?: string
          p_text?: string
        }
        Returns: number
      }
      editorial_set_status: {
        Args: {
          p_actor?: string
          p_item: string
          p_reason?: string
          p_status: string
        }
        Returns: Json
      }
      editorial_upsert_items: {
        Args: { p_items: Json; p_run_id: string }
        Returns: Json
      }
      news_cluster_assign: {
        Args: { p_candidate_id: string; p_decision: Json }
        Returns: Json
      }
      news_cluster_neighbors: {
        Args: {
          p_candidate_id: string
          p_floor: number
          p_limit?: number
          p_team_regex?: string
          p_window: string
        }
        Returns: {
          candidate_id: string
          cluster_event_type: string
          cluster_first_fresh_at: string
          cluster_id: string
          cluster_last_fresh_at: string
          discovered_at: string
          exact_headline: boolean
          fresh_at: string
          headline: string
          headline_kind: string
          league: string
          normalized_headline: string
          provider_id: number
          published_at: string
          similarity: number
          source_domain: string
          source_id: number
          sport: string
          word_similarity: number
        }[]
      }
      news_ingest_batch: {
        Args: {
          p_candidates: Json
          p_rejections: Json
          p_run_id: string
          p_unit_key?: string
        }
        Returns: Json
      }
      news_reap_stale_clustering_runs: {
        Args: { p_stale_after?: string }
        Returns: Json
      }
      news_reap_stale_ranking_runs: {
        Args: { p_stale_after?: string }
        Returns: Json
      }
      news_reap_stale_runs: { Args: { p_stale_after?: string }; Returns: Json }
      news_warehouse_stats: { Args: { p_recent?: string }; Returns: Json }
      newsroom_invoke_worker: { Args: { p_provider?: string }; Returns: number }
      newsroom_release_lock: {
        Args: { p_holder: string; p_lock_key: string }
        Returns: boolean
      }
      newsroom_scheduler_status: { Args: never; Returns: Json }
      newsroom_try_acquire_lock: {
        Args: { p_holder: string; p_lock_key: string; p_ttl: string }
        Returns: boolean
      }
      story_cluster_age_out: {
        Args: {
          p_close_after?: string
          p_now?: string
          p_stable_after?: string
        }
        Returns: Json
      }
      story_cluster_merge: {
        Args: { p_from: string; p_into: string; p_reason?: string }
        Returns: Json
      }
      story_cluster_move_member: {
        Args: { p_candidate_id: string; p_to: string }
        Returns: Json
      }
      story_cluster_recompute: {
        Args: { p_cluster_id: string }
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

