<?php
/**
 * Oscario Webhook Receiver for Orders Tracking
 * Recibe eventos POST de Oscario y actualiza la tabla 'orders' en Supabase / Base de datos.
 */

header('Content-Type: application/json');

// Supabase REST Config (puedes ajustar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY si usas REST)
$supabaseUrl = getenv('SUPABASE_URL') ?: 'https://zeqootmdlfpospbwwzuh.supabase.co';
$supabaseKey = getenv('SUPABASE_SERVICE_ROLE_KEY') ?: '';

// Direct Database Config (opcional si conectas directamente vía PDO Postgres / MySQL)
$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: 'postgres';
$dbUser = getenv('DB_USER') ?: 'postgres';
$dbPass = getenv('DB_PASS') ?: '';
$dbPort = getenv('DB_PORT') ?: '5432';

try {
    // Leer el payload JSON enviado por Oscario
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data || !isset($data['code']) || !isset($data['status'])) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => 'Invalid payload. "code" and "status" fields are required.'
        ]);
        exit;
    }

    $code = trim($data['code']);
    $oscarioStatus = trim($data['status']);
    $dateReport = isset($data['date_report']) ? trim($data['date_report']) : date('Y-m-d H:i:s');
    $note = isset($data['note']) ? trim($data['note']) : '';

    // Mapeo del estado de Oscario al estado global del pedido (status)
    $mappedOrderStatus = mapOscarioToOrderStatus($oscarioStatus);

    // Intentar actualización vía PDO si la base de datos directa está configurada
    $updated = false;

    if (!empty($dbPass) || getenv('DB_HOST')) {
        try {
            $dsn = "pgsql:host=$dbHost;port=$dbPort;dbname=$dbName";
            $pdo = new PDO($dsn, $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);

            // 1. Buscar por tracking_code
            $stmt = $pdo->prepare("
                UPDATE orders 
                SET shipping_status = :shipping_status, 
                    shipping_date_report = :shipping_date_report, 
                    shipping_note = :shipping_note,
                    status = COALESCE(:mapped_status, status),
                    updated_at = NOW()
                WHERE tracking_code = :code OR id::text LIKE :code_like
            ");

            $codeLike = '%' . str_replace('#WEB-', '', $code) . '%';
            $stmt->execute([
                ':shipping_status' => $oscarioStatus,
                ':shipping_date_report' => $dateReport,
                ':shipping_note' => $note,
                ':mapped_status' => $mappedOrderStatus,
                ':code' => $code,
                ':code_like' => $codeLike
            ]);

            if ($stmt->rowCount() > 0) {
                $updated = true;
            }
        } catch (Exception $e) {
            // Continuar con Supabase REST
        }
    }

    // Fallback: Actualizar usando la API REST de Supabase con cURL
    if (!$updated && !empty($supabaseUrl) && !empty($supabaseKey)) {
        $cleanCode = str_replace('#WEB-', '', $code);
        
        // 1. Buscar pedido por tracking_code o prefijo ID
        $queryUrl = "$supabaseUrl/rest/v1/orders?select=id&or=(tracking_code.eq.$code,id.ilike.$cleanCode*)";
        
        $ch = curl_init($queryUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "apikey: $supabaseKey",
            "Authorization: Bearer $supabaseKey"
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $orders = json_decode($response, true);

        if (!empty($orders) && is_array($orders)) {
            $orderId = $orders[0]['id'];
            $patchUrl = "$supabaseUrl/rest/v1/orders?id=eq.$orderId";

            $patchData = [
                'shipping_status' => $oscarioStatus,
                'shipping_date_report' => date('c', strtotime($dateReport)),
                'shipping_note' => $note
            ];
            if ($mappedOrderStatus !== null) {
                $patchData['status'] = $mappedOrderStatus;
            }

            $ch = curl_init($patchUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($patchData));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                "apikey: $supabaseKey",
                "Authorization: Bearer $supabaseKey",
                "Content-Type: application/json",
                "Prefer: return=minimal"
            ]);
            $patchRes = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $updated = true;
            }
        } else {
            // Auto-crear paquete no existente en ERP
            $postUrl = "$supabaseUrl/rest/v1/orders";
            $postData = [
                'tracking_code' => $code,
                'shipping_status' => $oscarioStatus,
                'shipping_date_report' => date('c', strtotime($dateReport)),
                'shipping_note' => $note,
                'status' => $mappedOrderStatus !== null ? $mappedOrderStatus : 'preparing',
                'total' => 0,
                'service_type' => 'oscario_express',
                'notes' => 'Creado automáticamente por Webhook de Oscario'
            ];

            $ch = curl_init($postUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($postData));
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                "apikey: $supabaseKey",
                "Authorization: Bearer $supabaseKey",
                "Content-Type: application/json",
                "Prefer: return=minimal"
            ]);
            $postRes = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300) {
                $updated = true;
            }
        }
    }

    echo json_encode([
        'success' => true,
        'message' => 'Status updated successfully.',
        'data' => [
            'code' => $code,
            'status' => $oscarioStatus,
            'mapped_order_status' => $mappedOrderStatus,
            'date_report' => $dateReport
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Error: ' . $e->getMessage()
    ]);
}

/**
 * Mapea los ~45 estados de Oscario a los 3 estados fundamentales del pedido ('completed', 'cancelled', 'preparing').
 */
function mapOscarioToOrderStatus(string $status): ?string {
    $status = trim($status);

    // 1. Estados completados / entregados
    $completedStatuses = [
        'Livré',
        'Coli non retournée aprés 7 jours = livré',
        'Remboursé'
    ];
    if (in_array($status, $completedStatuses, true)) {
        return 'completed';
    }

    // 2. Estados cancelados / devueltos
    $cancelledStatuses = [
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
        'Retourné vers l\'agence',
        'Retourner en Stock'
    ];
    if (in_array($status, $cancelledStatuses, true)) {
        return 'cancelled';
    }

    // 3. Estados en tránsito / en preparación / incidencias activas
    return 'preparing';
}
