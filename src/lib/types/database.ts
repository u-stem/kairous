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
      card_elaborations: {
        Row: {
          card_id: string
          created_at: string
          elaboration_text: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          elaboration_text: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          elaboration_text?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_elaborations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_elaborations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      card_reviews: {
        Row: {
          card_id: string
          id: string
          rating: number
          response_ms: number
          reviewed_at: string
          session_id: string
        }
        Insert: {
          card_id: string
          id?: string
          rating: number
          response_ms?: number
          reviewed_at?: string
          session_id: string
        }
        Update: {
          card_id?: string
          id?: string
          rating?: number
          response_ms?: number
          reviewed_at?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_reviews_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_reviews_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          back: string
          card_type: string
          created_at: string
          display_order: number
          front: string
          id: string
          material_id: string
        }
        Insert: {
          back: string
          card_type?: string
          created_at?: string
          display_order?: number
          front: string
          id?: string
          material_id: string
        }
        Update: {
          back?: string
          card_type?: string
          created_at?: string
          display_order?: number
          front?: string
          id?: string
          material_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          display_order: number
          id: string
          name: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          cards_reviewed: number
          id: string
          log_date: string
          method_id: string
          session_count: number
          subject_id: string
          total_sec: number
          user_id: string
        }
        Insert: {
          cards_reviewed?: number
          id?: string
          log_date?: string
          method_id: string
          session_count?: number
          subject_id: string
          total_sec?: number
          user_id: string
        }
        Update: {
          cards_reviewed?: number
          id?: string
          log_date?: string
          method_id?: string
          session_count?: number
          subject_id?: string
          total_sec?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "learning_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_methods: {
        Row: {
          category: string
          created_at: string
          default_config: Json
          default_duration_sec: number | null
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          default_config?: Json
          default_duration_sec?: number | null
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          default_config?: Json
          default_duration_sec?: number | null
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
          user_id?: string | null
        }
        Relationships: []
      }
      material_methods: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          material_id: string
          method_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          material_id: string
          method_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          material_id?: string
          method_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_methods_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_methods_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "learning_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      material_tags: {
        Row: {
          created_at: string
          material_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          material_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          material_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_tags_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          id: string
          source_type: string | null
          title: string
          total_cards: number
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          source_type?: string | null
          title: string
          total_cards?: number
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          source_type?: string | null
          title?: string
          total_cards?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_subject_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_schedules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string
          message_type: string
          time: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label: string
          message_type: string
          time: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          message_type?: string
          time?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          notification_enabled: boolean
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          notification_enabled?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          notification_enabled?: boolean
        }
        Relationships: []
      }
      session_materials: {
        Row: {
          id: string
          material_id: string
          session_id: string
        }
        Insert: {
          id?: string
          material_id: string
          session_id: string
        }
        Update: {
          id?: string
          material_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_materials_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_materials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          duration_sec: number
          ended_at: string | null
          id: string
          material_id: string | null
          meta: Json
          method_id: string
          self_rating: number | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          duration_sec?: number
          ended_at?: string | null
          id?: string
          material_id?: string | null
          meta?: Json
          method_id: string
          self_rating?: number | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          duration_sec?: number
          ended_at?: string | null
          id?: string
          material_id?: string | null
          meta?: Json
          method_id?: string
          self_rating?: number | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_method_id_fkey"
            columns: ["method_id"]
            isOneToOne: false
            referencedRelation: "learning_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      srs_states: {
        Row: {
          card_id: string
          difficulty: number
          due_date: string
          id: string
          lapses: number
          last_reviewed_at: string | null
          reps: number
          stability: number
          state: string
          user_id: string
        }
        Insert: {
          card_id: string
          difficulty?: number
          due_date?: string
          id?: string
          lapses?: number
          last_reviewed_at?: string | null
          reps?: number
          stability?: number
          state?: string
          user_id: string
        }
        Update: {
          card_id?: string
          difficulty?: number
          due_date?: string
          id?: string
          lapses?: number
          last_reviewed_at?: string | null
          reps?: number
          stability?: number
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "srs_states_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "srs_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      batch_upsert_srs_states: { Args: { p_states: Json }; Returns: undefined }
      complete_session_reviews: {
        Args: {
          p_elaborations?: Json
          p_reviews: Json
          p_session_id: string
          p_srs_states: Json
          p_user_id: string
        }
        Returns: undefined
      }
      create_card_with_order: {
        Args: { p_back: string; p_front: string; p_material_id: string }
        Returns: string
      }
      get_due_counts_by_subject: {
        Args: { p_target_date: string; p_user_id: string }
        Returns: {
          due_count: number
          subject_name: string
        }[]
      }
      get_due_materials: {
        Args: { p_today: string; p_user_id: string }
        Returns: {
          due_count: number
          material_id: string
          method_id: string
          method_name: string
          method_slug: string
          subject_color: string
          subject_id: string
          subject_name: string
          title: string
        }[]
      }
      get_interleaving_due_cards: {
        Args: { p_session_id: string; p_today: string; p_user_id: string }
        Returns: {
          back: string
          card_id: string
          display_order: number
          front: string
          material_title: string
        }[]
      }
      increment_total_cards:
        | {
            Args: { p_delta: number; p_material_id: string }
            Returns: undefined
          }
        | {
            Args: { p_delta: number; p_material_id: string; p_user_id?: string }
            Returns: undefined
          }
      remove_material_method: {
        Args: { p_material_id: string; p_method_id: string; p_user_id: string }
        Returns: undefined
      }
      upsert_daily_log: {
        Args: {
          p_cards_reviewed: number
          p_duration_sec: number
          p_log_date: string
          p_method_id: string
          p_session_count?: number
          p_subject_id: string
          p_user_id: string
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
