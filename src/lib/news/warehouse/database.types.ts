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
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
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
            referencedRelation: "news_candidates"
            referencedColumns: ["id"]
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
    }
    Views: {
      news_headline_groups: {
        Row: {
          candidate_count: number | null
          first_seen_at: string | null
          headline_kind: string | null
          last_seen_at: string | null
          normalized_headline: string | null
          sample_headline: string | null
          source_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      news_ingest_batch: {
        Args: {
          p_candidates: Json
          p_rejections: Json
          p_run_id: string
          p_unit_key?: string
        }
        Returns: Json
      }
      news_warehouse_stats: { Args: { p_recent?: string }; Returns: Json }
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

