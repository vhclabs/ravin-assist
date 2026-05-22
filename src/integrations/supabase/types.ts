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
      agent_pending: {
        Row: {
          action: Json
          created_at: string
          phone: string
          summary: string
        }
        Insert: {
          action: Json
          created_at?: string
          phone: string
          summary: string
        }
        Update: {
          action?: Json
          created_at?: string
          phone?: string
          summary?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          passcode: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          passcode: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          passcode?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      email_recipients: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          tags: string[] | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          tags?: string[] | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          tags?: string[] | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      kv_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          kind: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          kind?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          kind?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          cnpj: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          last_interaction_at: string | null
          name: string | null
          next_followup_at: string | null
          notes: string | null
          origin: string | null
          owner_id: string | null
          phone: string | null
          score: number | null
          status: Database["public"]["Enums"]["lead_status"]
          unread_count: number
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string | null
          next_followup_at?: string | null
          notes?: string | null
          origin?: string | null
          owner_id?: string | null
          phone?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          unread_count?: number
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_interaction_at?: string | null
          name?: string | null
          next_followup_at?: string | null
          notes?: string | null
          origin?: string | null
          owner_id?: string | null
          phone?: string | null
          score?: number | null
          status?: Database["public"]["Enums"]["lead_status"]
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_data: Json
          created_at: string
          created_by: string | null
          email_body: string | null
          email_subject: string | null
          id: string
          items: Json
          lead_id: string | null
          number: string | null
          status: string
          totals: Json
          updated_at: string
        }
        Insert: {
          client_data: Json
          created_at?: string
          created_by?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          items?: Json
          lead_id?: string | null
          number?: string | null
          status?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          client_data?: Json
          created_at?: string
          created_by?: string | null
          email_body?: string | null
          email_subject?: string | null
          id?: string
          items?: Json
          lead_id?: string | null
          number?: string | null
          status?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          ipi_pct: number
          ncm: string | null
          qty_per_box: number
          sku: string | null
          stock: number
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          id?: string
          ipi_pct?: number
          ncm?: string | null
          qty_per_box?: number
          sku?: string | null
          stock?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          ipi_pct?: number
          ncm?: string | null
          qty_per_box?: number
          sku?: string | null
          stock?: number
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_instances: {
        Row: {
          api_token: string | null
          created_at: string
          id: string
          instance_name: string
          owner_id: string | null
          phone_number: string | null
          status: Database["public"]["Enums"]["wa_instance_status"]
          updated_at: string
        }
        Insert: {
          api_token?: string | null
          created_at?: string
          id?: string
          instance_name: string
          owner_id?: string | null
          phone_number?: string | null
          status?: Database["public"]["Enums"]["wa_instance_status"]
          updated_at?: string
        }
        Update: {
          api_token?: string | null
          created_at?: string
          id?: string
          instance_name?: string
          owner_id?: string | null
          phone_number?: string | null
          status?: Database["public"]["Enums"]["wa_instance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_instances_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          content: string | null
          direction: string
          id: string
          instance_name: string
          lead_id: string | null
          message_id: string | null
          message_type: string | null
          raw: Json | null
          remote_jid: string
          timestamp: string
        }
        Insert: {
          content?: string | null
          direction: string
          id?: string
          instance_name: string
          lead_id?: string | null
          message_id?: string | null
          message_type?: string | null
          raw?: Json | null
          remote_jid: string
          timestamp?: string
        }
        Update: {
          content?: string | null
          direction?: string
          id?: string
          instance_name?: string
          lead_id?: string | null
          message_id?: string | null
          message_type?: string | null
          raw?: Json | null
          remote_jid?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          details: Json
          event: string | null
          id: string
          instance_name: string | null
          level: string
          message_id: string | null
          phone: string | null
          source: string
          stage: string
          summary: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event?: string | null
          id?: string
          instance_name?: string | null
          level?: string
          message_id?: string | null
          phone?: string | null
          source?: string
          stage: string
          summary: string
        }
        Update: {
          created_at?: string
          details?: Json
          event?: string | null
          id?: string
          instance_name?: string | null
          level?: string
          message_id?: string | null
          phone?: string | null
          source?: string
          stage?: string
          summary?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "master" | "vendedor"
      lead_status:
        | "novo"
        | "qualificado"
        | "proposta"
        | "negociacao"
        | "fechado"
        | "perdido"
      task_status: "pendente" | "em_andamento" | "concluida" | "cancelada"
      wa_instance_status: "desconectado" | "conectando" | "conectado" | "erro"
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
      app_role: ["master", "vendedor"],
      lead_status: [
        "novo",
        "qualificado",
        "proposta",
        "negociacao",
        "fechado",
        "perdido",
      ],
      task_status: ["pendente", "em_andamento", "concluida", "cancelada"],
      wa_instance_status: ["desconectado", "conectando", "conectado", "erro"],
    },
  },
} as const
