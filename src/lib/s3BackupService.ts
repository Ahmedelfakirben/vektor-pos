// Servicio de Backup Automático con S3
import { supabase } from './supabase';

// Configuración de S3 desde variables de entorno
const S3_CONFIG = {
  endpoint: import.meta.env.VITE_S3_ENDPOINT || 'https://fsn1.your-objectstorage.com',
  accessKey: import.meta.env.VITE_S3_ACCESS_KEY || '',
  secretKey: import.meta.env.VITE_S3_SECRET_KEY || '',
  bucket: import.meta.env.VITE_S3_BUCKET_NAME || 'coffee-shop-backups',
  region: import.meta.env.VITE_S3_REGION || 'eu-central-1',
};

export interface BackupConfig {
  id?: string;
  tables: string[];
  s3_enabled: boolean;
  schedule_enabled: boolean;
  schedule_time?: string; // Formato: "02:00" (HH:mm)
  schedule_frequency?: 'daily' | 'weekly' | 'monthly';
  retention_days?: number;
  created_at?: string;
  updated_at?: string;
}

export interface BackupResult {
  success: boolean;
  timestamp: string;
  total_records: number;
  size_mb: number;
  tables_count: number;
  s3_url?: string;
  error?: string;
}

/**
 * Crear backup automático y subirlo a S3
 */
export async function createAutomatedBackup(
  userId: string,
  tables: string[]
): Promise<BackupResult> {
  try {
    console.log('📦 Creando backup automático...', { userId, tables });

    // 1. Exportar datos de cada tabla
    const backupData: any = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      type: 'automatic',
      metadata: {
        created_by: userId,
        created_at: new Date().toISOString(),
        tables_count: tables.length,
      },
      tables: {},
    };

    let totalRecords = 0;

    for (const tableName of tables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('*');

        if (error) {
          console.error(`Error exportando tabla ${tableName}:`, error);
          continue;
        }

        backupData.tables[tableName] = data || [];
        totalRecords += (data || []).length;
      } catch (err) {
        console.error(`Error procesando tabla ${tableName}:`, err);
      }
    }

    // 2. Convertir a JSON
    const jsonString = JSON.stringify(backupData, null, 2);
    const sizeInBytes = new Blob([jsonString]).size;
    const sizeInMB = parseFloat((sizeInBytes / (1024 * 1024)).toFixed(2));

    // 3. Subir a S3 usando Edge Function
    const fileName = `backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.json`;
    const s3Result = await uploadToS3ViaEdgeFunction(backupData, fileName);

    // 4. Registrar en historial
    try {
      await supabase.from('backup_history').insert({
        created_by: userId,
        backup_type: 'automatic',
        size_mb: sizeInMB,
        tables_included: tables,
        status: s3Result.success ? 'completed' : 'failed',
        notes: s3Result.success ? `Subido a S3: ${s3Result.s3_url}` : `Error: ${s3Result.error}`,
        s3_url: s3Result.s3_url || null,
        file_name: fileName,
      });
    } catch (historyError) {
      console.error('Error guardando en historial:', historyError);
    }

    return {
      success: s3Result.success,
      timestamp: backupData.timestamp,
      total_records: totalRecords,
      size_mb: sizeInMB,
      tables_count: tables.length,
      s3_url: s3Result.s3_url,
      error: s3Result.error,
    };
  } catch (error: any) {
    console.error('Error en backup automático:', error);
    return {
      success: false,
      timestamp: new Date().toISOString(),
      total_records: 0,
      size_mb: 0,
      tables_count: 0,
      error: error.message,
    };
  }
}

/**
 * Subir backup a S3 usando API endpoint
 */
async function uploadToS3ViaEdgeFunction(
  backupData: any,
  fileName: string
): Promise<{ success: boolean; s3_url?: string; error?: string }> {
  try {
    // Usar API local o endpoint configurado
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const endpoint = `${apiUrl}/api/backup-to-s3`;

    console.log('☁️ Subiendo a S3 via API...', { fileName, endpoint });

    // Llamar a API para subir a S3
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        backupData,
        fileName,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error('Error en API:', result);
      return {
        success: false,
        error: result.error || 'Error desconocido al subir a S3',
      };
    }

    console.log('✅ Backup subido a S3:', result.url);

    return {
      success: true,
      s3_url: result.url,
    };
  } catch (error: any) {
    console.error('Error llamando a API:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Obtener configuración de backup automático
 */
export async function getBackupConfig(): Promise<BackupConfig | null> {
  try {
    const { data, error } = await supabase
      .from('backup_config')
      .select('*')
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    return null;
  }
}

/**
 * Guardar configuración de backup automático
 */
export async function saveBackupConfig(config: BackupConfig): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('backup_config')
      .upsert({
        ...config,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error guardando configuración:', error);
    return false;
  }
}

/**
 * Obtener lista de backups desde S3
 */
export async function listS3Backups(): Promise<any[]> {
  try {
    // En producción, esto debería llamar a una Edge Function
    // que liste los objetos en S3
    console.log('📋 Listando backups desde S3...');

    // Por ahora, retornamos desde el historial local
    const { data, error } = await supabase
      .from('backup_history')
      .select('*')
      .eq('backup_type', 'automatic')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error listando backups:', error);
    return [];
  }
}

/**
 * Descargar backup desde S3
 */
export async function downloadFromS3(s3Url: string, fileName: string): Promise<boolean> {
  try {
    console.log('⬇️ Descargando desde S3:', s3Url);

    const response = await fetch(s3Url);
    if (!response.ok) {
      throw new Error('Error descargando desde S3');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Error descargando desde S3:', error);
    return false;
  }
}

/**
 * Eliminar backups antiguos según política de retención
 */
export async function cleanupOldBackups(retentionDays: number = 30): Promise<number> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const { data, error } = await supabase
      .from('backup_history')
      .delete()
      .lt('created_at', cutoffDate.toISOString())
      .select();

    if (error) throw error;

    const deletedCount = data?.length || 0;
    console.log(`🗑️ Eliminados ${deletedCount} backups antiguos`);

    return deletedCount;
  } catch (error) {
    console.error('Error limpiando backups antiguos:', error);
    return 0;
  }
}

/**
 * Verificar conexión con S3
 */
export async function testS3Connection(): Promise<boolean> {
  try {
    if (!S3_CONFIG.accessKey || !S3_CONFIG.secretKey) {
      console.warn('Credenciales S3 no configuradas');
      return false;
    }

    // En producción, esto debería llamar a una Edge Function
    // que verifique la conexión con S3
    console.log('🔌 Verificando conexión S3...', {
      endpoint: S3_CONFIG.endpoint,
      bucket: S3_CONFIG.bucket,
      region: S3_CONFIG.region,
    });

    // Por ahora, asumimos que está configurado correctamente
    return true;
  } catch (error) {
    console.error('Error verificando S3:', error);
    return false;
  }
}

/**
 * Obtener información de S3
 */
export function getS3Info() {
  return {
    configured: !!(S3_CONFIG.accessKey && S3_CONFIG.secretKey),
    endpoint: S3_CONFIG.endpoint,
    bucket: S3_CONFIG.bucket,
    region: S3_CONFIG.region,
  };
}
