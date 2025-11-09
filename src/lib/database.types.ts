export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: {
          id: string
          name: string
          address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          address?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          address?: string | null
          created_at?: string
        }
      }
      it_experts: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string | null
          location_id: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          phone?: string | null
          location_id?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string | null
          location_id?: string | null
          is_active?: boolean
          created_at?: string
        }
      }
      availability_schedules: {
        Row: {
          id: string
          expert_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_available: boolean
          created_at: string
        }
        Insert: {
          id?: string
          expert_id: string
          day_of_week: number
          start_time: string
          end_time: string
          is_available?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          expert_id?: string
          day_of_week?: number
          start_time?: string
          end_time?: string
          is_available?: boolean
          created_at?: string
        }
      }
      appointments: {
        Row: {
          id: string
          customer_name: string
          customer_email: string
          customer_phone: string
          location_id: string
          expert_id: string
          appointment_date: string
          appointment_time: string
          service_type: string
          status: 'pending' | 'approved' | 'rejected'
          notes: string | null
          admin_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_name: string
          customer_email: string
          customer_phone: string
          location_id: string
          expert_id: string
          appointment_date: string
          appointment_time: string
          service_type?: string
          status?: 'pending' | 'approved' | 'rejected'
          notes?: string | null
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_name?: string
          customer_email?: string
          customer_phone?: string
          location_id?: string
          expert_id?: string
          appointment_date?: string
          appointment_time?: string
          service_type?: string
          status?: 'pending' | 'approved' | 'rejected'
          notes?: string | null
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
