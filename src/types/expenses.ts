export type ExpenseCategory = 'supplier' | 'salary' | 'rent' | 'utilities' | 'maintenance' | 'other';

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  supplier_id?: string;
  employee_id?: string;
  receipt_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}