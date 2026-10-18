#!/bin/bash

# ============================================
# Script para configurar Cron Job de Backups Automáticos
# ============================================
# Este script configura un cron job que ejecuta backups automáticos
# Usar en el servidor donde está desplegada la aplicación (Coolify)
# ============================================

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Configuración de Cron Job - Backups Automáticos${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. Verificar si estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: No se encontró package.json${NC}"
    echo -e "${RED}Ejecuta este script desde la raíz del proyecto${NC}"
    exit 1
fi

echo -e "${YELLOW}1. Verificando dependencias...${NC}"

# 2. Verificar que existe curl
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl no está instalado${NC}"
    exit 1
fi

echo -e "${GREEN}✓ curl instalado${NC}"

# 3. Obtener URL de la Edge Function
echo ""
echo -e "${YELLOW}2. Configuración de Supabase Edge Function${NC}"
read -p "URL de tu proyecto Supabase (ej: https://tuproyecto.supabase.co): " SUPABASE_URL
read -p "CRON_SECRET (genera uno aleatorio si no tienes): " CRON_SECRET

if [ -z "$CRON_SECRET" ]; then
    CRON_SECRET=$(openssl rand -hex 32)
    echo -e "${GREEN}✓ CRON_SECRET generado: ${CRON_SECRET}${NC}"
fi

# 4. Crear script de ejecución
echo ""
echo -e "${YELLOW}3. Creando script de ejecución...${NC}"

cat > /tmp/backup-cron.sh << EOF
#!/bin/bash
# Script de Cron para Backups Automáticos

# URL de la Edge Function
EDGE_FUNCTION_URL="${SUPABASE_URL}/functions/v1/cron-backup"

# Secret para autenticación
CRON_SECRET="${CRON_SECRET}"

# Log file
LOG_FILE="/var/log/coffee-backups.log"

# Ejecutar backup
echo "\$(date): Ejecutando backup automático..." >> \$LOG_FILE

response=\$(curl -s -w "\n%{http_code}" \\
  -X POST \\
  -H "Authorization: Bearer \$CRON_SECRET" \\
  -H "Content-Type: application/json" \\
  "\$EDGE_FUNCTION_URL")

http_code=\$(echo "\$response" | tail -n 1)
body=\$(echo "\$response" | head -n -1)

if [ "\$http_code" -eq 200 ]; then
    echo "\$(date): ✓ Backup completado exitosamente" >> \$LOG_FILE
    echo "\$body" >> \$LOG_FILE
else
    echo "\$(date): ✗ Error en backup (HTTP \$http_code)" >> \$LOG_FILE
    echo "\$body" >> \$LOG_FILE
fi

echo "----------------------------------------" >> \$LOG_FILE
EOF

chmod +x /tmp/backup-cron.sh

echo -e "${GREEN}✓ Script creado: /tmp/backup-cron.sh${NC}"

# 5. Configurar frecuencia
echo ""
echo -e "${YELLOW}4. Configuración de frecuencia${NC}"
echo "Selecciona la frecuencia del backup automático:"
echo "1) Diario a las 2:00 AM"
echo "2) Diario a las 3:00 AM"
echo "3) Cada 12 horas"
echo "4) Semanal (Domingo a las 2:00 AM)"
echo "5) Personalizado"

read -p "Opción [1-5]: " FREQ_OPTION

case $FREQ_OPTION in
    1)
        CRON_SCHEDULE="0 2 * * *"
        CRON_DESC="Diario a las 2:00 AM"
        ;;
    2)
        CRON_SCHEDULE="0 3 * * *"
        CRON_DESC="Diario a las 3:00 AM"
        ;;
    3)
        CRON_SCHEDULE="0 */12 * * *"
        CRON_DESC="Cada 12 horas"
        ;;
    4)
        CRON_SCHEDULE="0 2 * * 0"
        CRON_DESC="Domingo a las 2:00 AM"
        ;;
    5)
        read -p "Ingresa el cron schedule (ej: 0 2 * * *): " CRON_SCHEDULE
        CRON_DESC="Personalizado"
        ;;
    *)
        echo -e "${RED}Opción inválida${NC}"
        exit 1
        ;;
esac

echo -e "${GREEN}✓ Frecuencia seleccionada: ${CRON_DESC}${NC}"

# 6. Agregar al crontab
echo ""
echo -e "${YELLOW}5. Configurando crontab...${NC}"

# Crear entrada de cron
CRON_ENTRY="$CRON_SCHEDULE /tmp/backup-cron.sh"

# Verificar si ya existe
if crontab -l 2>/dev/null | grep -q "backup-cron.sh"; then
    echo -e "${YELLOW}⚠ Ya existe una entrada de backup en crontab${NC}"
    read -p "¿Deseas reemplazarla? (s/n): " REPLACE
    if [ "$REPLACE" == "s" ]; then
        # Eliminar entrada anterior
        crontab -l 2>/dev/null | grep -v "backup-cron.sh" | crontab -
        # Agregar nueva entrada
        (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
        echo -e "${GREEN}✓ Cron job actualizado${NC}"
    else
        echo -e "${YELLOW}Cancelado${NC}"
    fi
else
    # Agregar nueva entrada
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo -e "${GREEN}✓ Cron job agregado${NC}"
fi

# 7. Resumen
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Configuración Completada${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Frecuencia: ${GREEN}${CRON_DESC}${NC}"
echo -e "Schedule: ${GREEN}${CRON_SCHEDULE}${NC}"
echo -e "Script: ${GREEN}/tmp/backup-cron.sh${NC}"
echo -e "Log: ${GREEN}/var/log/coffee-backups.log${NC}"
echo ""
echo -e "${YELLOW}Comandos útiles:${NC}"
echo -e "  Ver crontab: ${GREEN}crontab -l${NC}"
echo -e "  Ver logs: ${GREEN}tail -f /var/log/coffee-backups.log${NC}"
echo -e "  Probar manualmente: ${GREEN}/tmp/backup-cron.sh${NC}"
echo -e "  Eliminar cron: ${GREEN}crontab -l | grep -v backup-cron.sh | crontab -${NC}"
echo ""
echo -e "${YELLOW}⚠ IMPORTANTE:${NC}"
echo -e "1. Guarda el CRON_SECRET en un lugar seguro: ${GREEN}${CRON_SECRET}${NC}"
echo -e "2. Configura el CRON_SECRET en las variables de entorno de Supabase"
echo -e "3. Despliega la Edge Function 'cron-backup' en Supabase"
echo ""

# 8. Guardar configuración
cat > /tmp/backup-config.txt << EOF
===========================================
CONFIGURACIÓN DE BACKUP AUTOMÁTICO
===========================================
Fecha de instalación: $(date)
SUPABASE_URL: ${SUPABASE_URL}
CRON_SECRET: ${CRON_SECRET}
Frecuencia: ${CRON_DESC}
Schedule: ${CRON_SCHEDULE}
===========================================
EOF

echo -e "${GREEN}✓ Configuración guardada en: /tmp/backup-config.txt${NC}"
echo ""
