import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const fallbackSchema = import.meta.env.VITE_SUPABASE_SCHEMA || 'vektor_pos';

export function getActiveSchema(): string {
  if (typeof window !== 'undefined') {
    const explicit = localStorage.getItem('vektor_active_schema');
    if (explicit) return explicit;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        try {
          const parsed = JSON.parse(localStorage.getItem(key) || '{}');
          if (parsed?.user?.user_metadata?.schema) {
            return parsed.user.user_metadata.schema;
          }
        } catch (_) {}
      }
    }
  }
  return fallbackSchema;
}

const baseClient = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: fallbackSchema }
});

if (typeof window !== 'undefined') {
  baseClient.auth.onAuthStateChange((event, session) => {
    if (session?.user?.user_metadata?.schema) {
      localStorage.setItem('vektor_active_schema', session.user.user_metadata.schema);
    } else if (event === 'SIGNED_OUT') {
      localStorage.removeItem('vektor_active_schema');
    }
  });
}

export const supabase = new Proxy(baseClient, {
  get(target, prop, receiver) {
    const activeSchema = getActiveSchema();
    if (activeSchema && activeSchema !== fallbackSchema) {
      if (prop === 'from') {
        return (relation: string) => target.schema(activeSchema).from(relation);
      }
      if (prop === 'rpc') {
        return (fn: string, args: any) => target.schema(activeSchema).rpc(fn, args);
      }
    }
    return Reflect.get(target, prop, receiver);
  }
}) as typeof baseClient;

export const formatImageUrl = (url?: string | null): string => {
  if (!url) return '';
  let cleanUrl = url.trim();
  if (cleanUrl.includes('supabasekong-ck8o0kswcg8wo8w0ko8occck.95.217.8.39.sslip.io')) {
    cleanUrl = cleanUrl.replace('http://supabasekong-ck8o0kswcg8wo8w0ko8occck.95.217.8.39.sslip.io', 'https://hichousupabase.elfakir.com');
  } else if (cleanUrl.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    cleanUrl = cleanUrl.replace('http://', 'https://');
  }
  // Convertir rutas relativas de storage a URLs completas de Supabase
  if (cleanUrl.startsWith('products/') || cleanUrl.startsWith('/products/')) {
    cleanUrl = `https://hichousupabase.elfakir.com/storage/v1/object/public/product-images/${cleanUrl.replace(/^\//, '')}`;
  } else if (cleanUrl.startsWith('product-images/')) {
    cleanUrl = `https://hichousupabase.elfakir.com/storage/v1/object/public/${cleanUrl}`;
  }
  return cleanUrl;
};

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          description: string;
          created_at: string;
        };
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          description: string;
          base_price: number;
          image_url: string;
          available: boolean;
          created_at: string;
          is_promo?: boolean;
          promo_price?: number | null;
        };
      };
      product_sizes: {
        Row: {
          id: string;
          product_id: string;
          size_name: string;
          price_modifier: number;
          stock: number;
          created_at: string;
        };
      };
      customers: {
        Row: {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          loyalty_points: number;
          created_at: string;
        };
      };
      orders: {
        Row: {
          id: string;
          customer_id: string | null;
          employee_id: string;
          status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          total: number;
          payment_method: 'cash' | 'card' | 'digital';
          notes: string;
          created_at: string;
          updated_at: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          size_id: string | null;
          quantity: number;
          unit_price: number;
          subtotal: number;
          notes: string;
          created_at: string;
        };
      };
      employee_profiles: {
        Row: {
          id: string;
          full_name: string;
          role: 'admin' | 'cashier' | 'barista';
          phone: string | null;
          active: boolean;
          email: string | null;
          deleted_at: string | null;
          created_at: string;
        };
      };
    };
  };
}
