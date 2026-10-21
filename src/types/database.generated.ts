// Keep aligned with supabase/migrations. Replace with Supabase CLI generated types
// after the first migration set is applied to a local or staging database.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      stores: Table<{
        id: string;
        name: string;
        phone: string | null;
        email: string | null;
        address: Json;
        timezone: string;
        logo_path: string | null;
        created_at: string;
        updated_at: string;
        archived_at: string | null;
      }>;
      store_memberships: Table<{
        id: string;
        store_id: string;
        user_id: string;
        active: boolean;
        created_at: string;
        updated_at: string;
      }>;
      user_preferences: Table<{
        id: string;
        user_id: string;
        theme: "system" | "light" | "dark";
        sidebar_collapsed: boolean;
        created_at: string;
        updated_at: string;
      }>;
      products: Table<{
        id: string;
        store_id: string;
        name: string;
        description: string | null;
        brand: string | null;
        sku: string | null;
        barcode: string | null;
        category_id: string | null;
        unit: string;
        unit_precision: number;
        sale_price_cents: number;
        average_cost_cents: number;
        minimum_stock: number;
        track_lots: boolean;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      product_packagings: Table<{
        id: string;
        store_id: string;
        product_id: string;
        label: string;
        barcode: string | null;
        base_quantity: number;
        created_at: string;
        updated_at: string;
      }>;
      inventory_balances: Table<{
        id: string;
        store_id: string;
        product_id: string;
        quantity: number;
        version: number;
        created_at: string;
        updated_at: string;
      }>;
      inventory_lots: Table<{
        id: string;
        store_id: string;
        product_id: string;
        code: string;
        expires_on: string | null;
        quantity: number;
        created_at: string;
        updated_at: string;
      }>;
      inventory_movements: Table<{
        id: string;
        store_id: string;
        product_id: string;
        lot_id: string | null;
        quantity_delta: number;
        kind: string;
        reason: string;
        sale_item_id: string | null;
        receipt_item_id: string | null;
        count_item_id: string | null;
        return_item_id: string | null;
        transfer_group: string | null;
        idempotency_key: string;
        payload_fingerprint: string | null;
        created_at: string;
        updated_at: string;
      }>;
      inventory_counts: Table<{
        id: string;
        store_id: string;
        status: "draft" | "applied" | "cancelled";
        notes: string | null;
        applied_at: string | null;
        apply_idempotency_key: string | null;
        apply_fingerprint: string | null;
        created_at: string;
        updated_at: string;
      }>;
      inventory_count_items: Table<{
        id: string;
        store_id: string;
        count_id: string;
        product_id: string;
        lot_id: string | null;
        expected_quantity: number;
        counted_quantity: number;
        balance_version: number;
        created_at: string;
        updated_at: string;
      }>;
      customers: Table<{
        id: string;
        store_id: string;
        name: string;
        phone: string | null;
        email: string | null;
        notes: string | null;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      customer_addresses: Table<{
        id: string;
        store_id: string;
        customer_id: string;
        label: string | null;
        street: string;
        number: string | null;
        complement: string | null;
        district: string | null;
        city: string;
        state: string | null;
        postal_code: string | null;
        reference: string | null;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      pets: Table<{
        id: string;
        store_id: string;
        customer_id: string;
        name: string;
        species: string;
        breed: string | null;
        birth_date: string | null;
        weight_kg: number | null;
        care_notes: string | null;
        behavior_notes: string | null;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      services: Table<{
        id: string;
        store_id: string;
        name: string;
        price_cents: number;
        duration_minutes: number;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      sales: Table<{
        id: string;
        store_id: string;
        number: number;
        customer_id: string | null;
        cash_session_id: string | null;
        status: "draft" | "completed" | "partially_refunded" | "refunded" | "cancelled";
        subtotal_cents: number;
        discount_cents: number;
        delivery_fee_cents: number;
        total_cents: number;
        idempotency_key: string;
        completed_at: string | null;
        cancelled_at: string | null;
        cancellation_reason: string | null;
        created_at: string;
        updated_at: string;
      }>;
      sale_items: Table<{
        id: string;
        store_id: string;
        sale_id: string;
        product_id: string | null;
        service_id: string | null;
        appointment_id: string | null;
        description: string;
        unit: string;
        quantity: number;
        unit_price_cents: number;
        unit_cost_cents: number;
        line_total_cents: number;
        created_at: string;
        updated_at: string;
      }>;
      sale_returns: Table<{
        id: string;
        store_id: string;
        sale_id: string;
        reason: string;
        refund_cents: number;
        idempotency_key: string;
        created_at: string;
        updated_at: string;
      }>;
      sale_return_items: Table<{
        id: string;
        store_id: string;
        return_id: string;
        sale_id: string;
        sale_item_id: string;
        quantity: number;
        restock: boolean;
        created_at: string;
        updated_at: string;
      }>;
      payments: Table<{
        id: string;
        store_id: string;
        sale_id: string;
        method: "cash" | "pix" | "debit_card" | "credit_card";
        amount_cents: number;
        tendered_cents: number | null;
        change_cents: number | null;
        received_at: string;
        idempotency_key: string;
        created_at: string;
        updated_at: string;
      }>;
      receivables: Table<{
        id: string;
        store_id: string;
        sale_id: string;
        customer_id: string;
        original_cents: number;
        remaining_cents: number;
        due_on: string | null;
        status: "open" | "paid" | "cancelled";
        created_at: string;
        updated_at: string;
      }>;
      receivable_payments: Table<{
        id: string;
        store_id: string;
        receivable_id: string;
        payment_id: string;
        amount_cents: number;
        created_at: string;
        updated_at: string;
      }>;
      payables: Table<{
        id: string;
        store_id: string;
        supplier_id: string | null;
        category_id: string | null;
        receipt_id: string | null;
        description: string;
        original_cents: number;
        remaining_cents: number;
        due_on: string;
        status: "open" | "paid" | "cancelled";
        created_at: string;
        updated_at: string;
      }>;
      payable_payments: Table<{
        id: string;
        store_id: string;
        payable_id: string;
        amount_cents: number;
        method: "cash" | "pix" | "debit_card" | "credit_card" | "transfer";
        paid_at: string;
        cash_session_id: string | null;
        idempotency_key: string;
        payload_fingerprint: string | null;
        created_at: string;
        updated_at: string;
      }>;
      cash_sessions: Table<{
        id: string;
        store_id: string;
        opened_by: string;
        opened_at: string;
        opening_cents: number;
        closed_by: string | null;
        closed_at: string | null;
        counted_cents: number | null;
        expected_cents: number | null;
        difference_cents: number | null;
        notes: string | null;
        status: "open" | "closed";
        created_at: string;
        updated_at: string;
      }>;
      cash_movements: Table<{
        id: string;
        store_id: string;
        cash_session_id: string;
        kind: "sale" | "receivable" | "reinforcement" | "withdrawal" | "expense" | "refund";
        amount_cents: number;
        payment_id: string | null;
        payable_payment_id: string | null;
        reason: string;
        idempotency_key: string;
        payload_fingerprint: string | null;
        occurred_at: string;
        created_at: string;
        updated_at: string;
      }>;
      cash_counts: Table<{
        id: string;
        store_id: string;
        cash_session_id: string;
        phase: "opening" | "closing";
        denomination_cents: number;
        quantity: number;
        created_at: string;
        updated_at: string;
      }>;
      expense_categories: Table<{
        id: string;
        store_id: string;
        name: string;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      goods_receipts: Table<{
        id: string;
        store_id: string;
        supplier_id: string | null;
        invoice_reference: string | null;
        received_at: string;
        total_cents: number;
        idempotency_key: string;
        notes: string | null;
        created_at: string;
        updated_at: string;
      }>;
      goods_receipt_items: Table<{
        id: string;
        store_id: string;
        receipt_id: string;
        product_id: string;
        lot_id: string | null;
        packages: number;
        conversion_factor: number;
        base_quantity: number;
        total_cost_cents: number;
        created_at: string;
        updated_at: string;
      }>;
      appointments: Table<{
        id: string;
        store_id: string;
        customer_id: string;
        pet_id: string;
        service_id: string;
        sale_id: string | null;
        starts_at: string;
        ends_at: string;
        price_cents: number;
        service_name_snapshot: string;
        status: "scheduled" | "arrived" | "in_progress" | "ready" | "delivered" | "cancelled" | "no_show";
        notes: string | null;
        version: number;
        created_at: string;
        updated_at: string;
      }>;
      deliveries: Table<{
        id: string;
        store_id: string;
        sale_id: string;
        customer_id: string;
        address_snapshot: Json;
        fee_cents: number;
        status: "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
        position: number;
        version: number;
        delivery_notes: string | null;
        delivered_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      delivery_events: Table<{
        id: string;
        store_id: string;
        delivery_id: string;
        from_status: string | null;
        to_status: string;
        reason: string | null;
        created_at: string;
        updated_at: string;
      }>;
      audit_logs: Table<{
        id: string;
        store_id: string;
        actor_user_id: string | null;
        action: string;
        entity_table: string;
        entity_id: string | null;
        details: Json;
        created_at: string;
        updated_at: string;
      }>;
      categories: Table<{
        id: string;
        store_id: string;
        name: string;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      suppliers: Table<{
        id: string;
        store_id: string;
        name: string;
        cnpj: string | null;
        phone: string | null;
        email: string | null;
        address: Json;
        notes: string | null;
        archived_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      open_cash: {
        Args: { p_store: string; p_opening: number; p_counts: Json; p_key: string };
        Returns: string;
      };
      move_cash: {
        Args: { p_store: string; p_session: string; p_kind: string; p_amount: number; p_reason: string; p_key: string };
        Returns: string;
      };
      complete_sale: {
        Args: {
          p_store: string;
          p_session: string | null;
          p_customer: string | null;
          p_items: Json;
          p_payments: Json;
          p_discount: number;
          p_key: string;
          p_due?: string | null;
          p_delivery_fee?: number;
          p_delivery_address?: Json | null;
        };
        Returns: string;
      };
      receive_receivable: {
        Args: { p_store: string; p_receivable: string; p_amount: number; p_method: string; p_session: string | null; p_key: string; p_tendered?: number | null };
        Returns: string;
      };
      adjust_stock: {
        Args: { p_store: string; p_product: string; p_counted: number; p_reason: string; p_key: string; p_lot?: string | null };
        Returns: string | null;
      };
      convert_to_bulk: {
        Args: { p_store: string; p_source_product: string; p_target_product: string; p_source_quantity: number; p_target_per_source: number; p_reason: string; p_key: string };
        Returns: string;
      };
      archive_product: {
        Args: { p_store: string; p_product: string };
        Returns: string;
      };
      pay_payable: {
        Args: { p_store: string; p_payable: string; p_amount: number; p_method: string; p_session: string | null; p_key: string };
        Returns: string;
      };
      create_expense: {
        Args: { p_store: string; p_description: string; p_category: string | null; p_amount: number; p_due: string; p_key: string; p_pay_now?: boolean; p_method?: string; p_session?: string | null };
        Returns: string;
      };
      receive_goods: {
        Args: { p_store: string; p_supplier: string | null; p_items: Json; p_key: string; p_due: string | null; p_pay_now?: boolean; p_method?: string; p_session?: string | null };
        Returns: string;
      };
      return_sale_items: {
        Args: { p_store: string; p_sale: string; p_lines: Json; p_reason: string; p_method: string | null; p_session: string | null; p_key: string };
        Returns: string;
      };
      cancel_sale: {
        Args: { p_store: string; p_sale: string; p_reason: string; p_method: string | null; p_session: string | null; p_key: string };
        Returns: string;
      };
      dashboard_overview: {
        Args: { p_store: string };
        Returns: Json;
      };
      start_inventory_count: {
        Args: { p_store: string; p_notes?: string };
        Returns: string;
      };
      save_inventory_count: {
        Args: { p_store: string; p_count: string; p_lines: Json };
        Returns: undefined;
      };
      apply_inventory_count: {
        Args: { p_store: string; p_count: string; p_key: string };
        Returns: string;
      };
      save_appointment: {
        Args: { p_store: string; p_customer: string; p_pet: string; p_service: string; p_start: string; p_notes?: string };
        Returns: string;
      };
      reschedule_appointment: {
        Args: { p_store: string; p_appointment: string; p_service: string; p_start: string; p_expected_version: number; p_reason: string };
        Returns: number;
      };
      set_appointment_status: {
        Args: { p_store: string; p_appointment: string; p_status: string; p_expected_version: number; p_reason?: string };
        Returns: number;
      };
      link_appointment_to_sale: {
        Args: { p_store: string; p_appointment: string; p_sale: string; p_sale_item: string; p_expected_version: number };
        Returns: number;
      };
      close_cash: {
        Args: { p_store: string; p_session: string; p_counted: number; p_notes: string; p_counts: Json; p_key: string };
        Returns: Json;
      };
      move_delivery: {
        Args: { p_store: string; p_delivery: string; p_status: string; p_position: number; p_expected_version: number; p_reason?: string };
        Returns: number;
      };
      issue_registration_ticket: {
        Args: { p_password: string; p_email: string; p_store_name: string; p_rate_key: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
