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
      accounts_transactions: {
        Row: {
          amount: number | null
          category: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          transaction_date: string | null
          type: string | null
        }
        Insert: {
          amount?: number | null
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          transaction_date?: string | null
          type?: string | null
        }
        Update: {
          amount?: number | null
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          transaction_date?: string | null
          type?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          created_at: string
          customer_id: string | null
          customer_name: string | null
          end_date: string | null
          id: string
          notes: string | null
          start_date: string | null
          status: string | null
          title: string
          value: number | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          status?: string | null
          title: string
          value?: number | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          status?: string | null
          title?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          mobile: string | null
          second_name: string | null
          work_phone: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          mobile?: string | null
          second_name?: string | null
          work_phone?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          mobile?: string | null
          second_name?: string | null
          work_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_documents: {
        Row: {
          created_at: string
          customer_id: string
          file_path: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          file_path: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          file_path?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_city: string | null
          address_country: string | null
          address_lat: number | null
          address_line: string | null
          address_lng: number | null
          address_mobile: string | null
          address_telephone: string | null
          billing_address_line: string | null
          billing_city: string | null
          billing_country: string | null
          billing_lat: number | null
          billing_lng: number | null
          billing_mobile: string | null
          billing_telephone: string | null
          company_name: string | null
          created_at: string
          currency: string | null
          customer_type: string
          display_name: string
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean
          language: string | null
          last_name: string | null
          mobile: string | null
          opening_balance: number | null
          payment_terms: string | null
          phone: string | null
          portal_enabled: boolean | null
          salutation: string | null
          special_instructions: string | null
          updated_at: string
          work_phone: string | null
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_lat?: number | null
          address_line?: string | null
          address_lng?: number | null
          address_mobile?: string | null
          address_telephone?: string | null
          billing_address_line?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_lat?: number | null
          billing_lng?: number | null
          billing_mobile?: string | null
          billing_telephone?: string | null
          company_name?: string | null
          created_at?: string
          currency?: string | null
          customer_type?: string
          display_name: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          language?: string | null
          last_name?: string | null
          mobile?: string | null
          opening_balance?: number | null
          payment_terms?: string | null
          phone?: string | null
          portal_enabled?: boolean | null
          salutation?: string | null
          special_instructions?: string | null
          updated_at?: string
          work_phone?: string | null
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_lat?: number | null
          address_line?: string | null
          address_lng?: number | null
          address_mobile?: string | null
          address_telephone?: string | null
          billing_address_line?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_lat?: number | null
          billing_lng?: number | null
          billing_mobile?: string | null
          billing_telephone?: string | null
          company_name?: string | null
          created_at?: string
          currency?: string | null
          customer_type?: string
          display_name?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean
          language?: string | null
          last_name?: string | null
          mobile?: string | null
          opening_balance?: number | null
          payment_terms?: string | null
          phone?: string | null
          portal_enabled?: boolean | null
          salutation?: string | null
          special_instructions?: string | null
          updated_at?: string
          work_phone?: string | null
        }
        Relationships: []
      }
      employees: {
        Row: {
          accommodation: number | null
          assigned_branch: string | null
          commission_rate: number | null
          created_at: string
          current_visa_expiry_date: string | null
          current_visa_status: string | null
          date_of_birth: string | null
          department: string | null
          email: string | null
          emirates_id_expiry_date: string | null
          emirates_id_number: string | null
          employee_id: string | null
          employment_type: string | null
          first_name: string
          food_allowance: number | null
          full_name: string | null
          hire_date: string | null
          id: string
          iloe_insurance_expiry_date: string | null
          iloe_insurance_number: string | null
          labor_card_expiry_date: string | null
          labor_card_number: string | null
          last_name: string | null
          medical_insurance_expiry_date: string | null
          medical_insurance_number: string | null
          nationality: string | null
          notes: string | null
          ohc_expiry_date: string | null
          ohc_number: string | null
          ot_amount: number | null
          part_time_card_expiry_date: string | null
          part_time_card_number: string | null
          passport_expiry_date: string | null
          passport_number: string | null
          phone: string | null
          position: string | null
          profile_photo: string | null
          referred_by: string | null
          salary: number | null
          status: string | null
          transport: number | null
          visa_expiry_date: string | null
          visa_issued_by: string | null
        }
        Insert: {
          accommodation?: number | null
          assigned_branch?: string | null
          commission_rate?: number | null
          created_at?: string
          current_visa_expiry_date?: string | null
          current_visa_status?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          emirates_id_expiry_date?: string | null
          emirates_id_number?: string | null
          employee_id?: string | null
          employment_type?: string | null
          first_name: string
          food_allowance?: number | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          iloe_insurance_expiry_date?: string | null
          iloe_insurance_number?: string | null
          labor_card_expiry_date?: string | null
          labor_card_number?: string | null
          last_name?: string | null
          medical_insurance_expiry_date?: string | null
          medical_insurance_number?: string | null
          nationality?: string | null
          notes?: string | null
          ohc_expiry_date?: string | null
          ohc_number?: string | null
          ot_amount?: number | null
          part_time_card_expiry_date?: string | null
          part_time_card_number?: string | null
          passport_expiry_date?: string | null
          passport_number?: string | null
          phone?: string | null
          position?: string | null
          profile_photo?: string | null
          referred_by?: string | null
          salary?: number | null
          status?: string | null
          transport?: number | null
          visa_expiry_date?: string | null
          visa_issued_by?: string | null
        }
        Update: {
          accommodation?: number | null
          assigned_branch?: string | null
          commission_rate?: number | null
          created_at?: string
          current_visa_expiry_date?: string | null
          current_visa_status?: string | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          emirates_id_expiry_date?: string | null
          emirates_id_number?: string | null
          employee_id?: string | null
          employment_type?: string | null
          first_name?: string
          food_allowance?: number | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          iloe_insurance_expiry_date?: string | null
          iloe_insurance_number?: string | null
          labor_card_expiry_date?: string | null
          labor_card_number?: string | null
          last_name?: string | null
          medical_insurance_expiry_date?: string | null
          medical_insurance_number?: string | null
          nationality?: string | null
          notes?: string | null
          ohc_expiry_date?: string | null
          ohc_number?: string | null
          ot_amount?: number | null
          part_time_card_expiry_date?: string | null
          part_time_card_number?: string | null
          passport_expiry_date?: string | null
          passport_number?: string | null
          phone?: string | null
          position?: string | null
          profile_photo?: string | null
          referred_by?: string | null
          salary?: number | null
          status?: string | null
          transport?: number | null
          visa_expiry_date?: string | null
          visa_issued_by?: string | null
        }
        Relationships: []
      }
      followup_remarks: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          remark: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          remark: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          remark?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          status: string | null
        }
        Insert: {
          budget?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          status?: string | null
        }
        Update: {
          budget?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          id: string
          quantity: number
          quote_id: string
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_id: string
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string | null
          customer_name: string | null
          expiry_date: string | null
          id: string
          notes: string | null
          probability: string | null
          project_name: string | null
          purchase_order: string | null
          quote_date: string | null
          quote_number: string | null
          quote_type: string | null
          salesperson: string | null
          status: string | null
          subject: string | null
          subtotal: number | null
          terms: string | null
          total: number | null
          updated_at: string
          vat_amount: number | null
          zoho_customer_id: string | null
          zoho_quote_id: string | null
        }
        Insert: {
          created_at?: string
          currency?: string | null
          customer_name?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          probability?: string | null
          project_name?: string | null
          purchase_order?: string | null
          quote_date?: string | null
          quote_number?: string | null
          quote_type?: string | null
          salesperson?: string | null
          status?: string | null
          subject?: string | null
          subtotal?: number | null
          terms?: string | null
          total?: number | null
          updated_at?: string
          vat_amount?: number | null
          zoho_customer_id?: string | null
          zoho_quote_id?: string | null
        }
        Update: {
          created_at?: string
          currency?: string | null
          customer_name?: string | null
          expiry_date?: string | null
          id?: string
          notes?: string | null
          probability?: string | null
          project_name?: string | null
          purchase_order?: string | null
          quote_date?: string | null
          quote_number?: string | null
          quote_type?: string | null
          salesperson?: string | null
          status?: string | null
          subject?: string | null
          subtotal?: number | null
          terms?: string | null
          total?: number | null
          updated_at?: string
          vat_amount?: number | null
          zoho_customer_id?: string | null
          zoho_quote_id?: string | null
        }
        Relationships: []
      }
      sales_leads: {
        Row: {
          company: string | null
          created_at: string
          currency: string | null
          customer_id: string | null
          email: string | null
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          lead_name: string
          lead_type: string | null
          notes: string | null
          phone: string | null
          position: number | null
          salesperson: string | null
          source: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_name: string
          lead_type?: string | null
          notes?: string | null
          phone?: string | null
          position?: number | null
          salesperson?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: string | null
          email?: string | null
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          lead_name?: string
          lead_type?: string | null
          notes?: string | null
          phone?: string | null
          position?: number | null
          salesperson?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          amount: number | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          notes: string | null
          order_date: string | null
          order_number: string | null
          status: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          notes?: string | null
          order_date?: string | null
          order_number?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
