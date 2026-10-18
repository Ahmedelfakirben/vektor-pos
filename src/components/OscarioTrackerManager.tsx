import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import {
  Truck,
  Search,
  Copy,
  Check,
  MessageCircle,
  RefreshCw,
  User,
  Phone,
  Plus,
  Globe,
  ExternalLink
} from 'lucide-react';
import { useCurrency } from '../contexts/CurrencyContext';

interface OrderItem {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: {
    name: string;
    image_url?: string;
  } | any;
  product_sizes?: {
    size_name: string;
  } | any;
}

interface OrderRecord {
  id: string;
  order_number?: number;
  total: number;
  created_at: string;
  status: string;
  service_type?: string;
  notes?: string;
  tracking_code?: string;
  shipping_status?: string;
  shipping_date_report?: string;
  shipping_note?: string;
  customers?: {
    name?: string;
    phone?: string;
  } | any;
  order_items?: OrderItem[];
}

export function OscarioTrackerManager() {
  const { formatCurrency } = useCurrency();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeView, setActiveView] = useState<'dashboard' | 'portal'>('dashboard');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const hasOscarioRecord = (o: OrderRecord) => {
    return Boolean((o.tracking_code && o.tracking_code.trim() !== '') || (o.shipping_status && o.shipping_status.trim() !== ''));
  };

  useEffect(() => {
    fetchOrders();

    // Suscripción en tiempo real a la tabla orders
    const channel = supabase
      .channel('oscario-tracker-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          total,
          created_at,
          status,
          service_type,
          notes,
          tracking_code,
          shipping_status,
          shipping_date_report,
          shipping_note,
          customers (
            name,
            phone
          ),
          order_items (
            id,
            quantity,
            unit_price,
            subtotal,
            products (
              name,
              image_url
            ),
            product_sizes (
              size_name
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      setOrders(data as unknown as OrderRecord[] || []);
    } catch (err: any) {
      console.error('Error fetching orders for Oscario tracking:', err);
      toast.error('Error al cargar pedidos');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTrackingCode = async (orderId: string, code: string) => {
    try {
      setUpdatingId(orderId);
      const trimmedCode = code.trim();
      const { error } = await supabase
        .from('orders')
        .update({
          tracking_code: trimmedCode || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (error) throw error;

      toast.success('Código de seguimiento guardado exitosamente');
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, tracking_code: trimmedCode } : o))
      );
    } catch (err: any) {
      console.error('Error saving tracking code:', err);
      toast.error(`Error al guardar tracking: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleLinkToERPOrder = async (autoCreatedId: string, trackingCode: string, targetRefInput: string) => {
    try {
      setUpdatingId(autoCreatedId);
      const cleanRef = targetRefInput.trim().replace(/^#?WEB-/i, '').toLowerCase();

      if (!cleanRef) {
        toast.error('Ingresa una referencia válida de pedido ERP (ej: #WEB-7343C9B5)');
        return;
      }

      // Buscar el pedido ERP objetivo por prefijo de ID o por order_number
      const targetOrder = orders.find((o) => {
        const refCode = o.id.slice(0, 8).toLowerCase();
        const numStr = o.order_number ? o.order_number.toString() : '';
        return refCode.startsWith(cleanRef) || numStr === cleanRef;
      });

      if (!targetOrder) {
        toast.error(`No se encontró ningún pedido ERP con la referencia "${targetRefInput}"`);
        return;
      }

      // 1. Asignar tracking_code al pedido ERP objetivo
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          tracking_code: trackingCode,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetOrder.id);

      if (updateError) throw updateError;

      // 2. Si el registro actual era un paquete auto-creado independiente, eliminarlo para fusionar
      if (autoCreatedId !== targetOrder.id) {
        await supabase
          .from('orders')
          .delete()
          .eq('id', autoCreatedId);
      }

      toast.success(`¡Envío vinculado exitosamente al pedido ERP #WEB-${targetOrder.id.slice(0, 8).toUpperCase()}!`);
      await fetchOrders();
    } catch (err: any) {
      console.error('Error linking to ERP order:', err);
      toast.error(`Error al vincular: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Generar URL pública para la tienda del cliente
  const getCustomerTrackerUrl = (order: OrderRecord) => {
    const refCode = `WEB-${order.id.slice(0, 8).toUpperCase()}`;
    const origin = window.location.origin.includes(':5173')
      ? window.location.origin
      : window.location.origin.replace(':5173', ':5173');
    return `${origin}/order/${refCode}`;
  };

  const copyTrackerUrl = (order: OrderRecord) => {
    const url = getCustomerTrackerUrl(order);
    navigator.clipboard.writeText(url);
    setCopiedId(order.id);
    toast.success('¡Enlace de seguimiento copiado al portapapeles!');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const sendTrackerViaWhatsApp = (order: OrderRecord) => {
    const phone = order.customers?.phone ? order.customers.phone.replace(/[^0-9]/g, '') : '';
    const refCode = `#WEB-${order.id.slice(0, 8).toUpperCase()}`;
    const trackerUrl = getCustomerTrackerUrl(order);

    const text = `Bonjour ! Voici le lien pour suivre en direct l'état de votre commande ${refCode} :\n\n🔗 ${trackerUrl}\n\nMerci de votre confiance !`;
    const encoded = encodeURIComponent(text);
    const whatsappUrl = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}`
      : `https://api.whatsapp.com/send?text=${encoded}`;

    window.open(whatsappUrl, '_blank');
  };

  // Regular expression capturing all official Oscario driver/incident statuses
  const incidentRegex = /injoignable|sans réponse|sans reponse|numéro erroné|numero errone|correction|faux|hors zone|change|refusé|refuse|pas intéréssé|pas interesse/i;

  // Filter Oscario-associated packages vs unassociated ERP orders
  const oscarioOrders = orders.filter(hasOscarioRecord);
  const unassociatedOrders = orders.filter((o) => !hasOscarioRecord(o));

  // Search filtering on Oscario packages
  const filteredOscarioOrders = oscarioOrders.filter((order) => {
    const search = searchTerm.toLowerCase().trim();
    const refCode = `WEB-${order.id.slice(0, 8)}`.toLowerCase();
    const orderNum = order.order_number ? order.order_number.toString() : '';
    const custName = (order.customers?.name || '').toLowerCase();
    const custPhone = (order.customers?.phone || '').toLowerCase();
    const tracking = (order.tracking_code || '').toLowerCase();
    const oscStatus = (order.shipping_status || '').toLowerCase();

    const matchesSearch =
      !search ||
      refCode.includes(search) ||
      orderNum.includes(search) ||
      custName.includes(search) ||
      custPhone.includes(search) ||
      tracking.includes(search) ||
      oscStatus.includes(search);

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    if (statusFilter === 'unlinked') {
      return order.service_type === 'oscario_express' || !order.customers?.name || (order.notes || '').includes('Webhook');
    }
    if (statusFilter === 'preparing') return order.status === 'preparing';
    if (statusFilter === 'completed') return order.status === 'completed';
    if (statusFilter === 'cancelled') return order.status === 'cancelled';
    if (statusFilter === 'incidents') {
      return incidentRegex.test(order.shipping_status || '');
    }
    return true;
  });

  // Search lookup for unassociated ERP orders (allows searching by #WEB-..., name, phone, etc.)
  const searchTrimmed = searchTerm.toLowerCase().trim();
  const matchingUnassociated = searchTrimmed !== ''
    ? unassociatedOrders.filter((order) => {
        const refCode = `web-${order.id.slice(0, 8)}`.toLowerCase();
        const rawId = order.id.toLowerCase();
        const orderNum = order.order_number ? order.order_number.toString() : '';
        const custName = (order.customers?.name || '').toLowerCase();
        const custPhone = (order.customers?.phone || '').toLowerCase();

        return (
          refCode.includes(searchTrimmed) ||
          rawId.includes(searchTrimmed) ||
          orderNum.includes(searchTrimmed) ||
          custName.includes(searchTrimmed) ||
          custPhone.includes(searchTrimmed)
        );
      })
    : [];

  // METRICS CALCULATED STRICTLY FOR OSCARIO PACKAGES
  const totalColisCount = oscarioOrders.length;
  const deliveredOrders = oscarioOrders.filter(
    (o) => o.status === 'completed' || /livré|livre|remboursé/i.test(o.shipping_status || '')
  );
  const deliveredCount = deliveredOrders.length;
  const deliveredPercentage =
    totalColisCount > 0 ? ((deliveredCount / totalColisCount) * 100).toFixed(0) : '0';

  const inTransitOrders = oscarioOrders.filter(
    (o) => o.status === 'preparing' && !incidentRegex.test(o.shipping_status || '')
  );
  const inTransitCount = inTransitOrders.length;
  const inTransitPercentage =
    totalColisCount > 0 ? ((inTransitCount / totalColisCount) * 100).toFixed(0) : '0';

  const failedOrders = oscarioOrders.filter(
    (o) => o.status === 'cancelled' || incidentRegex.test(o.shipping_status || '')
  );
  const failedCount = failedOrders.length;
  const failedPercentage =
    totalColisCount > 0 ? ((failedCount / totalColisCount) * 100).toFixed(0) : '0';

  const totalDeliveredRevenue = deliveredOrders.reduce(
    (sum, o) => sum + (Number(o.total) || 0),
    0
  );

  const unlinkedOscarioCount = oscarioOrders.filter(
    (o) => o.service_type === 'oscario_express' || !o.customers?.name || (o.notes || '').includes('Webhook')
  ).length;

  return (
    <div className="p-4 md:p-6 bg-gray-50 min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-2xl border border-amber-500/20">
                <Truck className="w-7 h-7" />
              </div>
              Tableau de bord - Oscario Express
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Seguimiento en tiempo real de paquetes y envíos de Oscario Express.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() => setActiveView('dashboard')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  activeView === 'dashboard'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Envíos Sincronizados
              </button>
              <button
                onClick={() => setActiveView('portal')}
                className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                  activeView === 'portal'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Portal Oscario (En Vivo)
              </button>
            </div>

            <button
              onClick={fetchOrders}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-all text-xs shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {activeView === 'portal' ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex-1 flex flex-col min-h-[700px]">
          <div className="p-4 bg-gray-900 text-white flex justify-between items-center">
            <div className="flex items-center gap-2 text-xs font-bold">
              <Globe className="w-4 h-4 text-amber-400" />
              <span>Plataforma Oficial Oscario Express</span>
            </div>
            <a
              href="https://oscario.site/is-admin/"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs text-amber-400 font-bold hover:underline"
            >
              Abrir en nueva pestaña <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <iframe
            src="https://oscario.site/is-admin/"
            title="Oscario Express Live Portal"
            className="w-full flex-1 border-0 min-h-[650px]"
          />
        </div>
      ) : (
        <>

      {/* OSCARIO EXPRESS SUMMARY DASHBOARD STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 shrink-0">
        {/* Total Chiffre d'affaires */}
        <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-5 rounded-2xl text-white shadow-md flex flex-col justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-100">
            Total chiffre d'affaires
          </span>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-black">{totalDeliveredRevenue.toFixed(0)}</span>
            <span className="text-lg font-bold">DH</span>
          </div>
          <span className="text-[11px] text-emerald-100 mt-1">Colis livrés facturés</span>
        </div>

        {/* Total Colis */}
        <div className="bg-zinc-900 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-400">
            Total Colis Oscario
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black">{totalColisCount}</span>
            <span className="text-xs font-bold text-zinc-400">(100%) Colis</span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1">Envíos registrados con seguimiento</span>
        </div>

        {/* En cours */}
        <div className="bg-amber-500 text-white p-5 rounded-2xl shadow-md flex flex-col justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wider text-amber-100">
            En cours
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black">{inTransitCount}</span>
            <span className="text-xs font-bold text-amber-100">({inTransitPercentage}%) Colis</span>
          </div>
          <span className="text-[11px] text-amber-100 mt-1">En camino o reparto</span>
        </div>

        {/* Livrés & Échoués */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-extrabold uppercase text-emerald-100">Livrés</span>
            <span className="text-2xl font-black mt-1">{deliveredCount}</span>
            <span className="text-[10px] text-emerald-100 font-bold">({deliveredPercentage}%)</span>
          </div>

          <div className="bg-red-600 text-white p-3.5 rounded-2xl shadow-sm flex flex-col justify-between">
            <span className="text-[11px] font-extrabold uppercase text-red-100">Échoués</span>
            <span className="text-2xl font-black mt-1">{failedCount}</span>
            <span className="text-[10px] text-red-100 font-bold">({failedPercentage}%)</span>
          </div>
        </div>
      </div>

      {/* Buscador & Filtros */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center shrink-0">
        <div className="relative w-full md:w-96">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por #Ref (ej: #WEB-7343C9B5), Cliente o Tracking..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {[
            { id: 'all', label: `📦 Todos los Envíos (${oscarioOrders.length})` },
            { id: 'unlinked', label: `⚡ Sin Vincular a ERP (${unlinkedOscarioCount})` },
            { id: 'incidents', label: '⚠️ Incidencias' },
            { id: 'preparing', label: '🚚 En cours / En tránsito' },
            { id: 'completed', label: '✅ Livrés / Entregados' },
            { id: 'cancelled', label: '❌ Échoués / Cancelados' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                statusFilter === f.id
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* RESULTADOS DE BÚSQUEDA DE PEDIDOS ERP PARA ASOCIAR NUEVA GUÍA OSCARIO */}
      {matchingUnassociated.length > 0 && (
        <div className="mb-8 p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-5 h-5 text-amber-600 font-bold" />
            <h2 className="text-sm font-black text-amber-900 uppercase tracking-wide">
              Pedido ERP encontrado para asociar a Oscario ({matchingUnassociated.length})
            </h2>
          </div>
          <p className="text-xs text-amber-800 mb-4">
            Ingresa el código de guía de Oscario para vincular el pedido y comenzar el seguimiento automático:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {matchingUnassociated.map((order) => {
              const refCode = `#WEB-${order.id.slice(0, 8).toUpperCase()}`;

              return (
                <div key={order.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono font-black text-sm text-gray-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                        {refCode}
                      </span>
                      <span className="text-xs font-bold text-amber-700">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-gray-800 flex items-center gap-1 mb-1">
                      <User className="w-3 h-3 text-amber-600" />
                      {order.customers?.name || 'Cliente sin nombre'}
                    </p>
                    {order.customers?.phone && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mb-3">
                        <Phone className="w-3 h-3" />
                        {order.customers.phone}
                      </p>
                    )}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const input = (e.currentTarget.elements.namedItem('trackingCodeInput') as HTMLInputElement);
                      if (input) handleSaveTrackingCode(order.id, input.value);
                    }}
                    className="flex gap-1.5 mt-2"
                  >
                    <input
                      name="trackingCodeInput"
                      type="text"
                      placeholder="Ej: OSC-998877"
                      className="flex-1 px-3 py-1.5 text-xs font-mono font-bold border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={updatingId === order.id}
                      className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-sm shrink-0"
                    >
                      Asociar
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lista de Pedidos Oscario */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-400">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium">Cargando paquetes de Oscario...</p>
        </div>
      ) : filteredOscarioOrders.length === 0 && matchingUnassociated.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <Truck className="w-16 h-16 mb-4 opacity-20 text-amber-600" />
          <p className="text-base font-bold text-gray-700">No hay envíos de Oscario activos</p>
          <p className="text-xs text-gray-500 mt-1 max-w-md text-center">
            {searchTerm
              ? `No se encontró ningún paquete de Oscario ni pedido ERP con la búsqueda "${searchTerm}".`
              : 'Escribe la referencia de tu pedido ERP (ej: #WEB-7343C9B5) en el buscador para asociarle su guía de Oscario.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
          {filteredOscarioOrders.map((order) => {
            const refCode = `#WEB-${order.id.slice(0, 8).toUpperCase()}`;
            const isIncident = /injoignable|pas de réponse|numéro erroné|correction|faux|hors zone|change|refusé/i.test(
              order.shipping_status || ''
            );

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 p-5 flex flex-col justify-between"
              >
                <div>
                  {/* Top Header Card */}
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-100">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-black text-base text-gray-900 bg-gray-100 px-2.5 py-0.5 rounded-lg border border-gray-200">
                          {refCode}
                        </span>
                        {order.order_number && (
                          <span className="text-xs text-gray-500 font-semibold">
                            (N° {order.order_number})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400 font-medium">
                        {new Date(order.created_at).toLocaleString('es-ES')}
                      </p>
                    </div>

                    <span className="text-xl font-black text-amber-600">
                      {formatCurrency(order.total)}
                    </span>
                  </div>

                  {/* Customer Info */}
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 mb-4 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
                      <User className="w-3.5 h-3.5 text-amber-600" />
                      <span>{order.customers?.name || 'Cliente sin nombre'}</span>
                    </div>
                    {order.customers?.phone && (
                      <div className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span>{order.customers.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Articles Summary */}
                  <div className="mb-4 space-y-1 bg-gray-50/50 p-2.5 rounded-xl border border-gray-100 max-h-28 overflow-y-auto">
                    {order.order_items && order.order_items.length > 0 ? (
                      order.order_items.map((item) => (
                        <div key={item.id} className="text-xs flex items-center justify-between text-gray-700">
                          <span className="truncate font-medium flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px] flex items-center justify-center">
                              {item.quantity}
                            </span>
                            {item.products?.name || 'Producto'}
                            {item.product_sizes?.size_name && (
                              <span className="text-[10px] text-gray-400">({item.product_sizes.size_name})</span>
                            )}
                          </span>
                          <span className="font-semibold">{formatCurrency(item.subtotal)}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 italic text-center">Sin artículos</p>
                    )}
                  </div>

                  {/* Tracking Assignment Section */}
                  <div className={`p-3.5 rounded-xl border mb-4 ${
                    isIncident
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : order.tracking_code
                      ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                      : 'bg-yellow-50/60 border-yellow-200 text-yellow-900'
                  }`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-amber-600" />
                        Guía / Tracking Oscario:
                      </span>
                      
                      {order.tracking_code ? (
                        <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md">
                          🔗 Asociado
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold bg-yellow-200 text-yellow-900 border border-yellow-300 px-2 py-0.5 rounded-md">
                          ⏳ Sin asociar
                        </span>
                      )}
                    </div>

                    {order.shipping_status && (
                      <div className="mb-2">
                        <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border inline-block ${
                          isIncident ? 'bg-amber-200 text-amber-900 border-amber-300' : 'bg-blue-100 text-blue-800 border-blue-200'
                        }`}>
                          Estado Oscario: {order.shipping_status}
                        </span>
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = (e.currentTarget.elements.namedItem('trackingCodeInput') as HTMLInputElement);
                        if (input) handleSaveTrackingCode(order.id, input.value);
                      }}
                      className="flex gap-1.5"
                    >
                      <input
                        name="trackingCodeInput"
                        type="text"
                        defaultValue={order.tracking_code || ''}
                        placeholder="Ej: OSC-998877"
                        className="flex-1 px-3 py-1.5 text-xs font-mono font-bold border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                      <button
                        type="submit"
                        disabled={updatingId === order.id}
                        className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                    </form>

                    {order.shipping_note && (
                      <p className="text-xs italic mt-2 text-gray-700 bg-white p-2 rounded-lg border border-gray-100">
                        💬 Nota repartidor: "{order.shipping_note}"
                      </p>
                    )}

                    {/* Option to link auto-created Oscario shipment to an ERP Order */}
                    {(!order.customers?.name || order.service_type === 'oscario_express' || order.notes?.includes('Webhook')) && (
                      <div className="mt-3 pt-2.5 border-t border-amber-200/80">
                        <span className="text-[11px] font-extrabold text-amber-900 block mb-1">
                          🔗 Vincular a pedido del ERP:
                        </span>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const input = (e.currentTarget.elements.namedItem('targetOrderInput') as HTMLInputElement);
                            if (input && order.tracking_code) {
                              handleLinkToERPOrder(order.id, order.tracking_code, input.value);
                            }
                          }}
                          className="flex gap-1.5"
                        >
                          <input
                            name="targetOrderInput"
                            type="text"
                            placeholder="Ej: #WEB-7343C9B5"
                            className="flex-1 px-2.5 py-1.5 text-xs font-mono font-bold border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                          />
                          <button
                            type="submit"
                            disabled={updatingId === order.id || !order.tracking_code}
                            className="px-3 py-1.5 text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-lg transition-all shadow-sm shrink-0"
                          >
                            Vincular
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>

                {/* Customer Link Generator Buttons */}
                <div className="pt-3 border-t border-gray-100 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyTrackerUrl(order)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl transition-all active:scale-95 border border-gray-200"
                    >
                      {copiedId === order.id ? (
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copiedId === order.id ? '¡Copiado!' : 'Copiar Enlace'}</span>
                    </button>

                    <button
                      onClick={() => sendTrackerViaWhatsApp(order)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold bg-green-500 hover:bg-green-600 text-white rounded-xl transition-all active:scale-95 shadow-sm"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
