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
      content_overrides: {
        Row: {
          created_at: string
          hidden: boolean
          id: string
          item_id: string
          kind: string
          label: string | null
          logo_url: string | null
          sort_order: number | null
          source_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hidden?: boolean
          id?: string
          item_id: string
          kind: string
          label?: string | null
          logo_url?: string | null
          sort_order?: number | null
          source_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hidden?: boolean
          id?: string
          item_id?: string
          kind?: string
          label?: string | null
          logo_url?: string | null
          sort_order?: number | null
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_overrides_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      login_activity: {
        Row: {
          created_at: string
          email: string | null
          id: string
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      playback_errors: {
        Row: {
          created_at: string
          id: string
          item_id: string | null
          kind: string | null
          message: string | null
          source_id: string | null
          status: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id?: string | null
          kind?: string | null
          message?: string | null
          source_id?: string | null
          status?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string | null
          kind?: string | null
          message?: string | null
          source_id?: string | null
          status?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      playlist_cache: {
        Row: {
          category_count: number
          channel_count: number
          channels: Json
          created_at: string
          fetched_at: string
          id: string
          source_id: string
          updated_at: string
        }
        Insert: {
          category_count?: number
          channel_count?: number
          channels?: Json
          created_at?: string
          fetched_at?: string
          id?: string
          source_id: string
          updated_at?: string
        }
        Update: {
          category_count?: number
          channel_count?: number
          channels?: Json
          created_at?: string
          fetched_at?: string
          id?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_cache_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          is_suspended: boolean
          last_login_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          is_suspended?: boolean
          last_login_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          is_suspended?: boolean
          last_login_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          is_public: boolean
          name: string
          password: string | null
          playlist_url: string | null
          slug: string
          sort_order: number
          type: string
          username: string | null
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name: string
          password?: string | null
          playlist_url?: string | null
          slug: string
          sort_order?: number
          type?: string
          username?: string | null
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_public?: boolean
          name?: string
          password?: string | null
          playlist_url?: string | null
          slug?: string
          sort_order?: number
          type?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_source_access: {
        Row: {
          created_at: string
          id: string
          source_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_source_access_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_progress: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          duration_seconds: number
          episode: number
          id: string
          position_seconds: number
          poster: string | null
          season: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          duration_seconds?: number
          episode?: number
          id?: string
          position_seconds?: number
          poster?: string | null
          season?: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          duration_seconds?: number
          episode?: number
          id?: string
          position_seconds?: number
          poster?: string | null
          season?: number
          title?: string | null
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
