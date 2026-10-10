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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      catalog_prices: {
        Row: {
          catalog_id: string
          game: string | null
          image: string | null
          name: string
          nm_price: number | null
          number: string | null
          rarity: string | null
          set_name: string | null
          updated_at: string
          variants: Json
        }
        Insert: {
          catalog_id: string
          game?: string | null
          image?: string | null
          name: string
          nm_price?: number | null
          number?: string | null
          rarity?: string | null
          set_name?: string | null
          updated_at?: string
          variants?: Json
        }
        Update: {
          catalog_id?: string
          game?: string | null
          image?: string | null
          name?: string
          nm_price?: number | null
          number?: string | null
          rarity?: string | null
          set_name?: string | null
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      items: {
        Row: {
          ai_confidence: number | null
          catalog_id: string | null
          category: string
          condition: string
          created_at: string
          est_value: number | null
          grade: string | null
          grader: string | null
          id: string
          line: string | null
          name: string
          notes: string | null
          number: string | null
          official_image: string | null
          price_high: number | null
          price_low: number | null
          price_sources: Json
          price_updated_at: string | null
          quantity: number
          set_name: string | null
          status: string
          subcategory: string | null
          thumbnail: string | null
          updated_at: string
          user_id: string
          variant: string | null
          year: string | null
        }
        Insert: {
          ai_confidence?: number | null
          catalog_id?: string | null
          category?: string
          condition?: string
          created_at?: string
          est_value?: number | null
          grade?: string | null
          grader?: string | null
          id?: string
          line?: string | null
          name: string
          notes?: string | null
          number?: string | null
          official_image?: string | null
          price_high?: number | null
          price_low?: number | null
          price_sources?: Json
          price_updated_at?: string | null
          quantity?: number
          set_name?: string | null
          status?: string
          subcategory?: string | null
          thumbnail?: string | null
          updated_at?: string
          user_id?: string
          variant?: string | null
          year?: string | null
        }
        Update: {
          ai_confidence?: number | null
          catalog_id?: string | null
          category?: string
          condition?: string
          created_at?: string
          est_value?: number | null
          grade?: string | null
          grader?: string | null
          id?: string
          line?: string | null
          name?: string
          notes?: string | null
          number?: string | null
          official_image?: string | null
          price_high?: number | null
          price_low?: number | null
          price_sources?: Json
          price_updated_at?: string | null
          quantity?: number
          set_name?: string | null
          status?: string
          subcategory?: string | null
          thumbnail?: string | null
          updated_at?: string
          user_id?: string
          variant?: string | null
          year?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          est_value: number | null
          id: string
          item_id: string
          price_high: number | null
          price_low: number | null
          recorded_at: string
          user_id: string
        }
        Insert: {
          est_value?: number | null
          id?: string
          item_id: string
          price_high?: number | null
          price_low?: number | null
          recorded_at?: string
          user_id?: string
        }
        Update: {
          est_value?: number | null
          id?: string
          item_id?: string
          price_high?: number | null
          price_low?: number | null
          recorded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
