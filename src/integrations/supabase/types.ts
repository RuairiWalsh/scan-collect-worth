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
      card_image_import_pairs: {
        Row: {
          back_path: string
          card_key: string | null
          error: string | null
          front_path: string
          id: string
          import_id: string
          metadata: Json
          pair_index: number
          status: string
          updated_at: string
        }
        Insert: {
          back_path: string
          card_key?: string | null
          error?: string | null
          front_path: string
          id?: string
          import_id: string
          metadata?: Json
          pair_index: number
          status?: string
          updated_at?: string
        }
        Update: {
          back_path?: string
          card_key?: string | null
          error?: string | null
          front_path?: string
          id?: string
          import_id?: string
          metadata?: Json
          pair_index?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_image_import_pairs_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "card_image_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      card_image_imports: {
        Row: {
          created_at: string
          file_hash: string
          file_name: string
          id: string
          page_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          file_hash: string
          file_name: string
          id?: string
          page_count: number
          user_id?: string
        }
        Update: {
          created_at?: string
          file_hash?: string
          file_name?: string
          id?: string
          page_count?: number
          user_id?: string
        }
        Relationships: []
      }
      card_product_images: {
        Row: {
          back_image: string | null
          back_storage_path: string | null
          card_key: string
          card_metadata: Json
          catalog_id: string | null
          claim_id: string
          front_storage_path: string | null
          image: string | null
          original_scan: string | null
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          back_image?: string | null
          back_storage_path?: string | null
          card_key: string
          card_metadata?: Json
          catalog_id?: string | null
          claim_id: string
          front_storage_path?: string | null
          image?: string | null
          original_scan?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          back_image?: string | null
          back_storage_path?: string | null
          card_key?: string
          card_metadata?: Json
          catalog_id?: string | null
          claim_id?: string
          front_storage_path?: string | null
          image?: string | null
          original_scan?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      catalog_price_history: {
        Row: {
          catalog_id: string
          id: string
          nm_price: number | null
          recorded_at: string
        }
        Insert: {
          catalog_id: string
          id?: string
          nm_price?: number | null
          recorded_at?: string
        }
        Update: {
          catalog_id?: string
          id?: string
          nm_price?: number | null
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_price_history_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "catalog_prices"
            referencedColumns: ["catalog_id"]
          },
        ]
      }
      catalog_prices: {
        Row: {
          card_metadata: Json
          catalog_id: string
          game: string | null
          image: string | null
          imported_card: boolean
          name: string
          nm_price: number | null
          number: string | null
          price_checked_at: string | null
          price_error: string | null
          price_provider: string
          price_status: string
          provider_card_id: string | null
          rarity: string | null
          set_name: string | null
          tcggraph_checked_at: string | null
          tcggraph_image: string | null
          updated_at: string
          variants: Json
        }
        Insert: {
          card_metadata?: Json
          catalog_id: string
          game?: string | null
          image?: string | null
          imported_card?: boolean
          name: string
          nm_price?: number | null
          number?: string | null
          price_checked_at?: string | null
          price_error?: string | null
          price_provider?: string
          price_status?: string
          provider_card_id?: string | null
          rarity?: string | null
          set_name?: string | null
          tcggraph_checked_at?: string | null
          tcggraph_image?: string | null
          updated_at?: string
          variants?: Json
        }
        Update: {
          card_metadata?: Json
          catalog_id?: string
          game?: string | null
          image?: string | null
          imported_card?: boolean
          name?: string
          nm_price?: number | null
          number?: string | null
          price_checked_at?: string | null
          price_error?: string | null
          price_provider?: string
          price_status?: string
          provider_card_id?: string | null
          rarity?: string | null
          set_name?: string | null
          tcggraph_checked_at?: string | null
          tcggraph_image?: string | null
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      folders: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      item_folders: {
        Row: {
          created_at: string
          folder_id: string
          item_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          folder_id: string
          item_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          folder_id?: string
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_folders_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_folders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          ai_confidence: number | null
          catalog_id: string | null
          category: string
          condition: string
          created_at: string
          est_value: number | null
          folder_id: string | null
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
          product_image: string | null
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
          folder_id?: string | null
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
          product_image?: string | null
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
          folder_id?: string | null
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
          product_image?: string | null
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
        Relationships: [
          {
            foreignKeyName: "items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_lots: {
        Row: {
          created_at: string
          id: string
          seller_id: string
          status: string
          title: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          seller_id?: string
          status?: string
          title?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          seller_id?: string
          status?: string
          title?: string | null
        }
        Relationships: []
      }
      listings: {
        Row: {
          created_at: string
          id: string
          item_id: string
          lot_id: string | null
          photos: string[]
          price: number
          seller_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          lot_id?: string | null
          photos?: string[]
          price: number
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          lot_id?: string | null
          photos?: string[]
          price?: number
          seller_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "listing_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_applications: {
        Row: {
          about: string | null
          created_at: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_name: string
          user_id: string
        }
        Insert: {
          about?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_name: string
          user_id?: string
        }
        Update: {
          about?: string | null
          created_at?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_name?: string
          user_id?: string
        }
        Relationships: []
      }
      numista_types: {
        Row: {
          data: Json
          fetched_at: string
          type_id: number
        }
        Insert: {
          data?: Json
          fetched_at?: string
          type_id: number
        }
        Update: {
          data?: Json
          fetched_at?: string
          type_id?: number
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string
          id: string
          note: string | null
          order_id: string
          source: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          source?: string
          status: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          buyer_id: string | null
          carrier: string | null
          created_at: string
          delivered_at: string | null
          id: string
          item_id: string | null
          item_name: string
          listing_id: string | null
          price: number
          seller_id: string
          ship_to: Json | null
          shipped_at: string | null
          status: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          buyer_id?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          item_id?: string | null
          item_name?: string
          listing_id?: string | null
          price?: number
          seller_id: string
          ship_to?: Json | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          buyer_id?: string | null
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          id?: string
          item_id?: string | null
          item_name?: string
          listing_id?: string | null
          price?: number
          seller_id?: string
          ship_to?: Json | null
          shipped_at?: string | null
          status?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_image_queue: {
        Args: { _status?: string }
        Returns: {
          card_key: string
          card_metadata: Json
          image: string
          original_scan: string
          review_note: string
          review_status: string
          reviewed_at: string
          updated_at: string
        }[]
      }
      admin_review_application: {
        Args: { _approve: boolean; _id: string }
        Returns: undefined
      }
      admin_review_image: {
        Args: { _approve: boolean; _key: string; _note?: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: {
          _enabled: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: undefined
      }
      admin_stats: { Args: never; Returns: Json }
      admin_users: {
        Args: never
        Returns: {
          collection_value: number
          created_at: string
          email: string
          item_count: number
          last_sign_in_at: string
          roles: string[]
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      market_listings: {
        Args: never
        Returns: {
          catalog_id: string
          category: string
          condition: string
          created_at: string
          est_value: number
          grade: string
          grader: string
          image: string
          item_id: string
          line: string
          listing_id: string
          name: string
          number: string
          photos: string[]
          price: number
          seller_id: string
          set_name: string
          store_name: string
          subcategory: string
          variant: string
        }[]
      }
      market_listings_with_photos: {
        Args: never
        Returns: {
          catalog_id: string
          category: string
          condition: string
          created_at: string
          est_value: number
          grade: string
          grader: string
          image: string
          item_id: string
          line: string
          listing_id: string
          name: string
          number: string
          photos: string[]
          price: number
          scan_image: string
          seller_id: string
          set_name: string
          store_name: string
          subcategory: string
          variant: string
        }[]
      }
      merchant_update_order: {
        Args: {
          _carrier?: string
          _id: string
          _status: string
          _tracking?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "merchant" | "user"
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
    Enums: {
      app_role: ["admin", "merchant", "user"],
    },
  },
} as const
