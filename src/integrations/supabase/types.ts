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
      attendance_logs: {
        Row: {
          attendance_date: string
          check_in: string | null
          check_out: string | null
          contract_id: string | null
          created_at: string
          employee_id: string | null
          employee_name: string | null
          id: string
          remarks: string | null
          shift: string | null
          shift_name: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          contract_id?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          remarks?: string | null
          shift?: string | null
          shift_name?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          check_in?: string | null
          check_out?: string | null
          contract_id?: string | null
          created_at?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          remarks?: string | null
          shift?: string | null
          shift_name?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_logs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          changed_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      contract_assets: {
        Row: {
          asset_tag: string | null
          asset_type: string | null
          contract_id: string
          created_at: string
          criticality: string | null
          description: string | null
          floor: string | null
          id: string
          location: string | null
          make: string | null
          model: string | null
          serial_no: string | null
          service_category_id: string | null
          status: string
          updated_at: string
          warranty_expiry: string | null
          zone: string | null
        }
        Insert: {
          asset_tag?: string | null
          asset_type?: string | null
          contract_id: string
          created_at?: string
          criticality?: string | null
          description?: string | null
          floor?: string | null
          id?: string
          location?: string | null
          make?: string | null
          model?: string | null
          serial_no?: string | null
          service_category_id?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
          zone?: string | null
        }
        Update: {
          asset_tag?: string | null
          asset_type?: string | null
          contract_id?: string
          created_at?: string
          criticality?: string | null
          description?: string | null
          floor?: string | null
          id?: string
          location?: string | null
          make?: string | null
          model?: string | null
          serial_no?: string | null
          service_category_id?: string | null
          status?: string
          updated_at?: string
          warranty_expiry?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_assets_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_assets_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_billing_lines: {
        Row: {
          annual_amount: number | null
          billing_line: string
          contract_id: string
          created_at: string
          id: string
          is_total_row: boolean
          monthly_amount: number | null
          notes: string | null
          service_category_id: string | null
          sort_order: number
          updated_at: string
          vat_status: string | null
        }
        Insert: {
          annual_amount?: number | null
          billing_line: string
          contract_id: string
          created_at?: string
          id?: string
          is_total_row?: boolean
          monthly_amount?: number | null
          notes?: string | null
          service_category_id?: string | null
          sort_order?: number
          updated_at?: string
          vat_status?: string | null
        }
        Update: {
          annual_amount?: number | null
          billing_line?: string
          contract_id?: string
          created_at?: string
          id?: string
          is_total_row?: boolean
          monthly_amount?: number | null
          notes?: string | null
          service_category_id?: string | null
          sort_order?: number
          updated_at?: string
          vat_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_billing_lines_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_billing_lines_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_consumables: {
        Row: {
          annual_amount: number | null
          category: string | null
          contract_id: string
          created_at: string
          id: string
          included: boolean
          item_name: string
          monthly_amount: number | null
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          annual_amount?: number | null
          category?: string | null
          contract_id: string
          created_at?: string
          id?: string
          included?: boolean
          item_name: string
          monthly_amount?: number | null
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          annual_amount?: number | null
          category?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          included?: boolean
          item_name?: string
          monthly_amount?: number | null
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_consumables_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_line_items: {
        Row: {
          active: boolean
          annual_amount: number | null
          contract_id: string
          created_at: string
          description: string
          frequency: string | null
          id: string
          line_no: number
          monthly_amount: number | null
          quantity: number | null
          scope_notes: string | null
          service_category_id: string | null
          sla_policy_id: string | null
          unit_rate: number | null
          uom: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_amount?: number | null
          contract_id: string
          created_at?: string
          description: string
          frequency?: string | null
          id?: string
          line_no?: number
          monthly_amount?: number | null
          quantity?: number | null
          scope_notes?: string | null
          service_category_id?: string | null
          sla_policy_id?: string | null
          unit_rate?: number | null
          uom?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_amount?: number | null
          contract_id?: string
          created_at?: string
          description?: string
          frequency?: string | null
          id?: string
          line_no?: number
          monthly_amount?: number | null
          quantity?: number | null
          scope_notes?: string | null
          service_category_id?: string | null
          sla_policy_id?: string | null
          unit_rate?: number | null
          uom?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_line_items_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_line_items_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_line_items_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_manpower_assignments: {
        Row: {
          active: boolean
          contract_id: string
          created_at: string
          designation: string | null
          employee_id: string | null
          employee_name: string | null
          end_date: string | null
          id: string
          manpower_plan_id: string | null
          notes: string | null
          remarks: string | null
          role_name: string | null
          shift_name: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          contract_id: string
          created_at?: string
          designation?: string | null
          employee_id?: string | null
          employee_name?: string | null
          end_date?: string | null
          id?: string
          manpower_plan_id?: string | null
          notes?: string | null
          remarks?: string | null
          role_name?: string | null
          shift_name?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          contract_id?: string
          created_at?: string
          designation?: string | null
          employee_id?: string | null
          employee_name?: string | null
          end_date?: string | null
          id?: string
          manpower_plan_id?: string | null
          notes?: string | null
          remarks?: string | null
          role_name?: string | null
          shift_name?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_manpower_assignments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_manpower_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_manpower_assignments_manpower_plan_id_fkey"
            columns: ["manpower_plan_id"]
            isOneToOne: false
            referencedRelation: "contract_manpower_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_manpower_plans: {
        Row: {
          active: boolean
          contract_id: string
          created_at: string
          days_per_week: number | null
          designation: string | null
          end_date: string | null
          hours_per_day: number | null
          id: string
          notes: string | null
          remarks: string | null
          required_headcount: number
          role_name: string
          service_category_id: string | null
          shift_end: string | null
          shift_name: string | null
          shift_start: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contract_id: string
          created_at?: string
          days_per_week?: number | null
          designation?: string | null
          end_date?: string | null
          hours_per_day?: number | null
          id?: string
          notes?: string | null
          remarks?: string | null
          required_headcount?: number
          role_name: string
          service_category_id?: string | null
          shift_end?: string | null
          shift_name?: string | null
          shift_start?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contract_id?: string
          created_at?: string
          days_per_week?: number | null
          designation?: string | null
          end_date?: string | null
          hours_per_day?: number | null
          id?: string
          notes?: string | null
          remarks?: string | null
          required_headcount?: number
          role_name?: string
          service_category_id?: string | null
          shift_end?: string | null
          shift_name?: string | null
          shift_start?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_manpower_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_manpower_plans_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payments: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          payment_date: string | null
          received_date: string | null
          sort_order: number | null
          status: string | null
          value: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          payment_date?: string | null
          received_date?: string | null
          sort_order?: number | null
          status?: string | null
          value?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          payment_date?: string | null
          received_date?: string | null
          sort_order?: number | null
          status?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          ac_duct_cleaning_date: string | null
          ac_duct_cleaning_status: string | null
          amc_ref_no: string | null
          billing_cycle: string | null
          building_type: string | null
          contract_manager_id: string | null
          contract_no: string | null
          contract_scope_type: string | null
          contract_type: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          end_date: string | null
          handyman_hours: number
          id: string
          module_type: string
          notes: string | null
          payment_terms: string | null
          ppm_1_date: string | null
          ppm_2_date: string | null
          ppm_3_date: string | null
          ppm_4_date: string | null
          ppm_schedule: Json | null
          remark: string | null
          retention_percent: number | null
          site_address: string | null
          site_name: string | null
          sla_profile_id: string | null
          spare_parts_amount: number | null
          start_date: string | null
          status: string | null
          title: string
          value: number | null
          vat_percent: number | null
          water_tank_cleaning_date: string | null
          water_tank_cleaning_status: string | null
        }
        Insert: {
          ac_duct_cleaning_date?: string | null
          ac_duct_cleaning_status?: string | null
          amc_ref_no?: string | null
          billing_cycle?: string | null
          building_type?: string | null
          contract_manager_id?: string | null
          contract_no?: string | null
          contract_scope_type?: string | null
          contract_type?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string | null
          handyman_hours?: number
          id?: string
          module_type?: string
          notes?: string | null
          payment_terms?: string | null
          ppm_1_date?: string | null
          ppm_2_date?: string | null
          ppm_3_date?: string | null
          ppm_4_date?: string | null
          ppm_schedule?: Json | null
          remark?: string | null
          retention_percent?: number | null
          site_address?: string | null
          site_name?: string | null
          sla_profile_id?: string | null
          spare_parts_amount?: number | null
          start_date?: string | null
          status?: string | null
          title: string
          value?: number | null
          vat_percent?: number | null
          water_tank_cleaning_date?: string | null
          water_tank_cleaning_status?: string | null
        }
        Update: {
          ac_duct_cleaning_date?: string | null
          ac_duct_cleaning_status?: string | null
          amc_ref_no?: string | null
          billing_cycle?: string | null
          building_type?: string | null
          contract_manager_id?: string | null
          contract_no?: string | null
          contract_scope_type?: string | null
          contract_type?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          end_date?: string | null
          handyman_hours?: number
          id?: string
          module_type?: string
          notes?: string | null
          payment_terms?: string | null
          ppm_1_date?: string | null
          ppm_2_date?: string | null
          ppm_3_date?: string | null
          ppm_4_date?: string | null
          ppm_schedule?: Json | null
          remark?: string | null
          retention_percent?: number | null
          site_address?: string | null
          site_name?: string | null
          sla_profile_id?: string | null
          spare_parts_amount?: number | null
          start_date?: string | null
          status?: string | null
          title?: string
          value?: number | null
          vat_percent?: number | null
          water_tank_cleaning_date?: string | null
          water_tank_cleaning_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contract_manager_id_fkey"
            columns: ["contract_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_sla_profile_id_fkey"
            columns: ["sla_profile_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
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
          address_community: string | null
          address_country: string | null
          address_lat: number | null
          address_line: string | null
          address_lng: number | null
          address_mobile: string | null
          address_telephone: string | null
          billing_address_line: string | null
          billing_city: string | null
          billing_community: string | null
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
          address_community?: string | null
          address_country?: string | null
          address_lat?: number | null
          address_line?: string | null
          address_lng?: number | null
          address_mobile?: string | null
          address_telephone?: string | null
          billing_address_line?: string | null
          billing_city?: string | null
          billing_community?: string | null
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
          address_community?: string | null
          address_country?: string | null
          address_lat?: number | null
          address_line?: string | null
          address_lng?: number | null
          address_mobile?: string | null
          address_telephone?: string | null
          billing_address_line?: string | null
          billing_city?: string | null
          billing_community?: string | null
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
      fm_cleaning_checklist_templates: {
        Row: {
          area: string | null
          created_at: string
          default_priority: string
          fm_contract_id: string
          id: string
          is_active: boolean
          sort_order: number
          task_name: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          default_priority?: string
          fm_contract_id: string
          id?: string
          is_active?: boolean
          sort_order?: number
          task_name: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          created_at?: string
          default_priority?: string
          fm_contract_id?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          task_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_cleaning_checklist_templates_fm_contract_id_fkey"
            columns: ["fm_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      fm_daily_cleaning_checks: {
        Row: {
          area: string | null
          check_date: string
          checked_by: string | null
          created_at: string
          fm_contract_id: string
          id: string
          remarks: string | null
          status: string
          task_name: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          check_date?: string
          checked_by?: string | null
          created_at?: string
          fm_contract_id: string
          id?: string
          remarks?: string | null
          status?: string
          task_name: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          check_date?: string
          checked_by?: string | null
          created_at?: string
          fm_contract_id?: string
          id?: string
          remarks?: string | null
          status?: string
          task_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fm_daily_cleaning_checks_fm_contract_id_fkey"
            columns: ["fm_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
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
      handyman_hours_log: {
        Row: {
          contract_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          hours: number
          id: string
          log_date: string
          notes: string | null
          report_id: string | null
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          hours?: number
          id?: string
          log_date?: string
          notes?: string | null
          report_id?: string | null
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          hours?: number
          id?: string
          log_date?: string
          notes?: string | null
          report_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handyman_hours_log_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handyman_hours_log_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handyman_hours_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_pack_items: {
        Row: {
          amount: number
          contract_line_item_id: string | null
          created_at: string
          description: string
          id: string
          invoice_pack_id: string
          item_type: string
          quantity: number
          remarks: string | null
          service_category_id: string | null
          service_report_id: string | null
          sort_order: number
          unit: string | null
          unit_rate: number
          vat_applicable: boolean
          work_order_id: string | null
        }
        Insert: {
          amount?: number
          contract_line_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          invoice_pack_id: string
          item_type: string
          quantity?: number
          remarks?: string | null
          service_category_id?: string | null
          service_report_id?: string | null
          sort_order?: number
          unit?: string | null
          unit_rate?: number
          vat_applicable?: boolean
          work_order_id?: string | null
        }
        Update: {
          amount?: number
          contract_line_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          invoice_pack_id?: string
          item_type?: string
          quantity?: number
          remarks?: string | null
          service_category_id?: string | null
          service_report_id?: string | null
          sort_order?: number
          unit?: string | null
          unit_rate?: number
          vat_applicable?: boolean
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_pack_items_contract_line_item_id_fkey"
            columns: ["contract_line_item_id"]
            isOneToOne: false
            referencedRelation: "contract_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_pack_items_invoice_pack_id_fkey"
            columns: ["invoice_pack_id"]
            isOneToOne: false
            referencedRelation: "invoice_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_pack_items_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_pack_items_service_report_id_fkey"
            columns: ["service_report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_pack_items_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_packs: {
        Row: {
          adjustment_amount: number
          approved_at: string | null
          base_contract_amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          client_reference: string | null
          contract_id: string
          created_at: string
          deduction_amount: number
          deductions_amount: number
          gross_amount: number
          id: string
          invoice_month: string | null
          invoice_no: string | null
          invoice_number: string | null
          monthly_report_id: string | null
          net_payable: number
          notes: string | null
          period_end: string
          period_start: string
          prepared_by: string | null
          remarks: string | null
          report_data: Json
          reporting_period_id: string | null
          retention_amount: number
          retention_percent: number
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          subtotal_amount: number
          total_amount: number
          updated_at: string
          variation_amount: number
          vat_amount: number
          vat_percent: number
        }
        Insert: {
          adjustment_amount?: number
          approved_at?: string | null
          base_contract_amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          client_reference?: string | null
          contract_id: string
          created_at?: string
          deduction_amount?: number
          deductions_amount?: number
          gross_amount?: number
          id?: string
          invoice_month?: string | null
          invoice_no?: string | null
          invoice_number?: string | null
          monthly_report_id?: string | null
          net_payable?: number
          notes?: string | null
          period_end: string
          period_start: string
          prepared_by?: string | null
          remarks?: string | null
          report_data?: Json
          reporting_period_id?: string | null
          retention_amount?: number
          retention_percent?: number
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
          variation_amount?: number
          vat_amount?: number
          vat_percent?: number
        }
        Update: {
          adjustment_amount?: number
          approved_at?: string | null
          base_contract_amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          client_reference?: string | null
          contract_id?: string
          created_at?: string
          deduction_amount?: number
          deductions_amount?: number
          gross_amount?: number
          id?: string
          invoice_month?: string | null
          invoice_no?: string | null
          invoice_number?: string | null
          monthly_report_id?: string | null
          net_payable?: number
          notes?: string | null
          period_end?: string
          period_start?: string
          prepared_by?: string | null
          remarks?: string | null
          report_data?: Json
          reporting_period_id?: string | null
          retention_amount?: number
          retention_percent?: number
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          subtotal_amount?: number
          total_amount?: number
          updated_at?: string
          variation_amount?: number
          vat_amount?: number
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_packs_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_packs_monthly_report_id_fkey"
            columns: ["monthly_report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_packs_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_reports: {
        Row: {
          approved_at: string | null
          contract_id: string
          created_at: string
          id: string
          manpower_variance: number | null
          month_end: string
          month_start: string
          ppm_compliance_percent: number | null
          prepared_by: string | null
          reactive_closure_percent: number | null
          remarks: string | null
          report_data: Json
          report_no: string | null
          reporting_period_id: string | null
          reviewed_by: string | null
          sla_compliance_percent: number | null
          status: string
          submitted_at: string | null
          summary: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          contract_id: string
          created_at?: string
          id?: string
          manpower_variance?: number | null
          month_end: string
          month_start: string
          ppm_compliance_percent?: number | null
          prepared_by?: string | null
          reactive_closure_percent?: number | null
          remarks?: string | null
          report_data?: Json
          report_no?: string | null
          reporting_period_id?: string | null
          reviewed_by?: string | null
          sla_compliance_percent?: number | null
          status?: string
          submitted_at?: string | null
          summary?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          manpower_variance?: number | null
          month_end?: string
          month_start?: string
          ppm_compliance_percent?: number | null
          prepared_by?: string | null
          reactive_closure_percent?: number | null
          remarks?: string | null
          report_data?: Json
          report_no?: string | null
          reporting_period_id?: string | null
          reviewed_by?: string | null
          sla_compliance_percent?: number | null
          status?: string
          submitted_at?: string | null
          summary?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_reports_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_reports_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      ppm_schedules: {
        Row: {
          active: boolean
          asset_id: string | null
          contract_id: string
          contract_line_item_id: string | null
          created_at: string
          end_date: string | null
          frequency: string | null
          id: string
          instructions: string | null
          interval_months: number | null
          schedule_name: string
          service_category_id: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          asset_id?: string | null
          contract_id: string
          contract_line_item_id?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          interval_months?: number | null
          schedule_name: string
          service_category_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          asset_id?: string | null
          contract_id?: string
          contract_line_item_id?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          interval_months?: number | null
          schedule_name?: string
          service_category_id?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppm_schedules_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "contract_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_schedules_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_schedules_contract_line_item_id_fkey"
            columns: ["contract_line_item_id"]
            isOneToOne: false
            referencedRelation: "contract_line_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_schedules_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ppm_visits: {
        Row: {
          asset_id: string | null
          assigned_team: string | null
          completed_at: string | null
          contract_id: string
          created_at: string
          due_date: string | null
          id: string
          notes: string | null
          planned_date: string
          ppm_schedule_id: string | null
          service_category_id: string | null
          service_report_id: string | null
          status: string
          updated_at: string
          work_order_id: string | null
        }
        Insert: {
          asset_id?: string | null
          assigned_team?: string | null
          completed_at?: string | null
          contract_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          planned_date: string
          ppm_schedule_id?: string | null
          service_category_id?: string | null
          service_report_id?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Update: {
          asset_id?: string | null
          assigned_team?: string | null
          completed_at?: string | null
          contract_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          planned_date?: string
          ppm_schedule_id?: string | null
          service_category_id?: string | null
          service_report_id?: string | null
          status?: string
          updated_at?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ppm_visits_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "contract_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_visits_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_visits_ppm_schedule_id_fkey"
            columns: ["ppm_schedule_id"]
            isOneToOne: false
            referencedRelation: "ppm_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_visits_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_visits_service_report_id_fkey"
            columns: ["service_report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_visits_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
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
      reporting_periods: {
        Row: {
          contract_id: string | null
          created_at: string
          id: string
          label: string | null
          period_end: string
          period_start: string
          period_type: string
          remarks: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          period_end: string
          period_start: string
          period_type: string
          remarks?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          period_end?: string
          period_start?: string
          period_type?: string
          remarks?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_periods_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
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
      service_categories: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          default_resolution_hours: number | null
          default_response_hours: number | null
          description: string | null
          discipline: string | null
          id: string
          is_ppm_enabled: boolean
          is_reactive_enabled: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          default_resolution_hours?: number | null
          default_response_hours?: number | null
          description?: string | null
          discipline?: string | null
          id?: string
          is_ppm_enabled?: boolean
          is_reactive_enabled?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          default_resolution_hours?: number | null
          default_response_hours?: number | null
          description?: string | null
          discipline?: string | null
          id?: string
          is_ppm_enabled?: boolean
          is_reactive_enabled?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_report_photos: {
        Row: {
          after_path: string | null
          before_path: string | null
          caption: string | null
          created_at: string
          id: string
          report_id: string
          sort_order: number
        }
        Insert: {
          after_path?: string | null
          before_path?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          report_id: string
          sort_order?: number
        }
        Update: {
          after_path?: string | null
          before_path?: string | null
          caption?: string | null
          created_at?: string
          id?: string
          report_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_report_photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "service_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      service_reports: {
        Row: {
          amount_received: number | null
          asset_id: string | null
          balance_amount: number | null
          client_representative: string | null
          completion_type: string | null
          contract_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          defects_found: string | null
          follow_up_required: boolean | null
          google_rating: number | null
          google_review: string | null
          handyman_hours: number | null
          hours_spent: number | null
          id: string
          item_status: string | null
          location: string | null
          material_supplied_by: string | null
          module_type: string
          next_service_date: string | null
          parts_used: string | null
          ppm_visit_id: string | null
          problem_reported: string | null
          recommendations: string | null
          report_no: string | null
          service_category_id: string | null
          service_date: string | null
          service_type: string | null
          signature_data: string | null
          signed_by: string | null
          status: string
          technician_name: string | null
          time_checked_in: string | null
          time_checked_out: string | null
          updated_at: string
          work_done: string | null
          work_order_id: string | null
        }
        Insert: {
          amount_received?: number | null
          asset_id?: string | null
          balance_amount?: number | null
          client_representative?: string | null
          completion_type?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          defects_found?: string | null
          follow_up_required?: boolean | null
          google_rating?: number | null
          google_review?: string | null
          handyman_hours?: number | null
          hours_spent?: number | null
          id?: string
          item_status?: string | null
          location?: string | null
          material_supplied_by?: string | null
          module_type?: string
          next_service_date?: string | null
          parts_used?: string | null
          ppm_visit_id?: string | null
          problem_reported?: string | null
          recommendations?: string | null
          report_no?: string | null
          service_category_id?: string | null
          service_date?: string | null
          service_type?: string | null
          signature_data?: string | null
          signed_by?: string | null
          status?: string
          technician_name?: string | null
          time_checked_in?: string | null
          time_checked_out?: string | null
          updated_at?: string
          work_done?: string | null
          work_order_id?: string | null
        }
        Update: {
          amount_received?: number | null
          asset_id?: string | null
          balance_amount?: number | null
          client_representative?: string | null
          completion_type?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          defects_found?: string | null
          follow_up_required?: boolean | null
          google_rating?: number | null
          google_review?: string | null
          handyman_hours?: number | null
          hours_spent?: number | null
          id?: string
          item_status?: string | null
          location?: string | null
          material_supplied_by?: string | null
          module_type?: string
          next_service_date?: string | null
          parts_used?: string | null
          ppm_visit_id?: string | null
          problem_reported?: string | null
          recommendations?: string | null
          report_no?: string | null
          service_category_id?: string | null
          service_date?: string | null
          service_type?: string | null
          signature_data?: string | null
          signed_by?: string | null
          status?: string
          technician_name?: string | null
          time_checked_in?: string | null
          time_checked_out?: string | null
          updated_at?: string
          work_done?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_reports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "contract_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_ppm_visit_id_fkey"
            columns: ["ppm_visit_id"]
            isOneToOne: false
            referencedRelation: "ppm_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_reports_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_events: {
        Row: {
          completion_due_at: string | null
          completion_sla_status: string | null
          contract_id: string | null
          created_at: string
          delay_reason: string | null
          event_at: string
          event_type: string
          exclusion_reason: string | null
          id: string
          response_due_at: string | null
          response_sla_status: string | null
          sla_policy_id: string | null
          work_order_id: string | null
        }
        Insert: {
          completion_due_at?: string | null
          completion_sla_status?: string | null
          contract_id?: string | null
          created_at?: string
          delay_reason?: string | null
          event_at?: string
          event_type: string
          exclusion_reason?: string | null
          id?: string
          response_due_at?: string | null
          response_sla_status?: string | null
          sla_policy_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          completion_due_at?: string | null
          completion_sla_status?: string | null
          contract_id?: string | null
          created_at?: string
          delay_reason?: string | null
          event_at?: string
          event_type?: string
          exclusion_reason?: string | null
          id?: string
          response_due_at?: string | null
          response_sla_status?: string | null
          sla_policy_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_events_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_events_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          active: boolean
          completion_hours: number | null
          completion_minutes: number | null
          contract_id: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          priority: string | null
          request_type: string | null
          response_hours: number | null
          response_minutes: number | null
          service_category_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          completion_hours?: number | null
          completion_minutes?: number | null
          contract_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority?: string | null
          request_type?: string | null
          response_hours?: number | null
          response_minutes?: number | null
          service_category_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          completion_hours?: number | null
          completion_minutes?: number | null
          contract_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority?: string | null
          request_type?: string | null
          response_hours?: number | null
          response_minutes?: number | null
          service_category_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_policies_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_add: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          module: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_add?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_add?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          module?: string
          updated_at?: string
          user_id?: string
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
      weekly_reports: {
        Row: {
          approved_at: string | null
          contract_id: string
          created_at: string
          id: string
          open_issues: number
          ppm_completed: number
          prepared_by: string | null
          remarks: string | null
          report_data: Json
          report_no: string | null
          reporting_period_id: string | null
          reviewed_by: string | null
          sla_breaches: number
          status: string
          submitted_at: string | null
          summary: Json
          updated_at: string
          week_end: string
          week_start: string
          work_orders_completed: number
        }
        Insert: {
          approved_at?: string | null
          contract_id: string
          created_at?: string
          id?: string
          open_issues?: number
          ppm_completed?: number
          prepared_by?: string | null
          remarks?: string | null
          report_data?: Json
          report_no?: string | null
          reporting_period_id?: string | null
          reviewed_by?: string | null
          sla_breaches?: number
          status?: string
          submitted_at?: string | null
          summary?: Json
          updated_at?: string
          week_end: string
          week_start: string
          work_orders_completed?: number
        }
        Update: {
          approved_at?: string | null
          contract_id?: string
          created_at?: string
          id?: string
          open_issues?: number
          ppm_completed?: number
          prepared_by?: string | null
          remarks?: string | null
          report_data?: Json
          report_no?: string | null
          reporting_period_id?: string | null
          reviewed_by?: string | null
          sla_breaches?: number
          status?: string
          submitted_at?: string | null
          summary?: Json
          updated_at?: string
          week_end?: string
          week_start?: string
          work_orders_completed?: number
        }
        Relationships: [
          {
            foreignKeyName: "weekly_reports_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_reports_reporting_period_id_fkey"
            columns: ["reporting_period_id"]
            isOneToOne: false
            referencedRelation: "reporting_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          arrived_at: string | null
          asset_id: string | null
          completed_at: string | null
          completion_due_at: string | null
          completion_sla_status: string | null
          contract_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          delay_reason: string | null
          id: string
          location: string | null
          module_type: string
          notes: string | null
          ppm_visit_id: string | null
          priority: string
          problem_reported: string | null
          reported_at: string | null
          request_type: string | null
          requested_date: string | null
          responded_at: string | null
          response_due_at: string | null
          response_sla_status: string | null
          scheduled_date: string | null
          service_category_id: string | null
          service_type: string | null
          sla_exclusion_reason: string | null
          status: string
          technician_id: string | null
          technician_name: string | null
          updated_at: string
          wo_no: string | null
          work_requested: string | null
        }
        Insert: {
          arrived_at?: string | null
          asset_id?: string | null
          completed_at?: string | null
          completion_due_at?: string | null
          completion_sla_status?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          delay_reason?: string | null
          id?: string
          location?: string | null
          module_type?: string
          notes?: string | null
          ppm_visit_id?: string | null
          priority?: string
          problem_reported?: string | null
          reported_at?: string | null
          request_type?: string | null
          requested_date?: string | null
          responded_at?: string | null
          response_due_at?: string | null
          response_sla_status?: string | null
          scheduled_date?: string | null
          service_category_id?: string | null
          service_type?: string | null
          sla_exclusion_reason?: string | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
          wo_no?: string | null
          work_requested?: string | null
        }
        Update: {
          arrived_at?: string | null
          asset_id?: string | null
          completed_at?: string | null
          completion_due_at?: string | null
          completion_sla_status?: string | null
          contract_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          delay_reason?: string | null
          id?: string
          location?: string | null
          module_type?: string
          notes?: string | null
          ppm_visit_id?: string | null
          priority?: string
          problem_reported?: string | null
          reported_at?: string | null
          request_type?: string | null
          requested_date?: string | null
          responded_at?: string | null
          response_due_at?: string | null
          response_sla_status?: string | null
          scheduled_date?: string | null
          service_category_id?: string | null
          service_type?: string | null
          sla_exclusion_reason?: string | null
          status?: string
          technician_id?: string | null
          technician_name?: string | null
          updated_at?: string
          wo_no?: string | null
          work_requested?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "contract_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_ppm_visit_id_fkey"
            columns: ["ppm_visit_id"]
            isOneToOne: false
            referencedRelation: "ppm_visits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_service_category_id_fkey"
            columns: ["service_category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      next_doc_no: { Args: { kind: string }; Returns: string }
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
