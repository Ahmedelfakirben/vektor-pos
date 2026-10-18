import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'
import { corsHeaders } from '../_shared/cors.ts'

function mapOscarioToOrderStatus(status: string): string | null {
    const trimmed = status.trim()

    const completedStatuses = [
        'Livré',
        'Coli non retournée aprés 7 jours = livré',
        'Remboursé'
    ]
    if (completedStatuses.includes(trimmed)) {
        return 'completed'
    }

    const cancelledStatuses = [
        'Annulé',
        'Annulé par vendeur',
        'Refusé',
        'Pas intéréssé',
        'Demande de retour',
        'Endomagé',
        'Perdu programme',
        'Retour client expédié',
        'Retour client reçu',
        'Retour expédié vers Tanger',
        'Retour expédié vers Tétouan',
        'Retour livreur expédié',
        'Retour livreur non reçu',
        'Retourné vers agence Guelmim',
        'Retourné vers agence Casablanca',
        'Retourné vers agence Fes',
        'Retourné vers agence Marrakech',
        'Retourné vers agence Meknes',
        'Retourné vers agence Oujda',
        'Retourné vers agence Rabat',
        'Retourné vers Agence Safi',
        'Retourné vers agence Tanger',
        'Retourné vers agence Tétouan',
        "Retourné vers l'agence",
        'Retourner en Stock'
    ]
    if (cancelledStatuses.includes(trimmed)) {
        return 'cancelled'
    }

    return 'preparing'
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const body = await req.json().catch(() => ({}))
        const { code, status: oscarioStatus, date_report, note } = body

        if (!code || !oscarioStatus) {
            return new Response(
                JSON.stringify({ success: false, message: 'Invalid payload. "code" and "status" fields are required.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const cleanCode = code.trim().replace(/^#?WEB-/i, '')
        const mappedOrderStatus = mapOscarioToOrderStatus(oscarioStatus)

        // 1. Buscar pedido por tracking_code o por prefijo de UUID
        let { data: orderData } = await supabaseAdmin
            .from('orders')
            .select('id')
            .eq('tracking_code', code.trim())
            .maybeSingle()

        if (!orderData && cleanCode) {
            const lower = cleanCode.toLowerCase()
            const minUuid = `${lower}-0000-0000-0000-000000000000`
            const maxUuid = `${lower}-ffff-ffff-ffff-ffffffffffff`

            const { data: matchedOrders } = await supabaseAdmin
                .from('orders')
                .select('id')
                .gte('id', minUuid)
                .lte('id', maxUuid)
                .limit(1)

            if (matchedOrders && matchedOrders.length > 0) {
                orderData = matchedOrders[0]
            }
        }

        if (!orderData) {
            // Crear el paquete automáticamente si no existía previamente en el ERP
            const { data: newOrder, error: createError } = await supabaseAdmin
                .from('orders')
                .insert({
                    tracking_code: code.trim(),
                    shipping_status: oscarioStatus.trim(),
                    shipping_date_report: date_report ? new Date(date_report).toISOString() : new Date().toISOString(),
                    shipping_note: note ? note.trim() : '',
                    status: mappedOrderStatus || 'preparing',
                    total: 0,
                    service_type: 'oscario_express',
                    notes: 'Creado automáticamente por Webhook de Oscario'
                })
                .select('id')
                .single()

            if (createError) throw createError
            orderData = newOrder

            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'New Oscario package created and updated successfully.',
                    order_id: orderData.id,
                    status: oscarioStatus,
                    mapped_status: mappedOrderStatus || 'preparing'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Actualizar el pedido
        const updatePayload: Record<string, any> = {
            shipping_status: oscarioStatus.trim(),
            shipping_date_report: date_report ? new Date(date_report).toISOString() : new Date().toISOString(),
            shipping_note: note ? note.trim() : '',
            updated_at: new Date().toISOString()
        }

        if (mappedOrderStatus) {
            updatePayload.status = mappedOrderStatus
        }

        const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update(updatePayload)
            .eq('id', orderData.id)

        if (updateError) throw updateError

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Record updated successfully.',
                order_id: orderData.id,
                status: oscarioStatus,
                mapped_status: mappedOrderStatus
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, message: error.message || 'Server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
