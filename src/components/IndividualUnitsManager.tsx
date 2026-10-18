import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import { Trash2, Plus, ScanBarcode, Lock, Sparkles, Printer, RefreshCw, ChevronDown, ChevronRight, Layers, Tag } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import { BarcodeLabelModal, IndividualUnitItem } from './BarcodeLabelModal';

export interface ProductSize {
    id: string;
    product_id: string;
    size_name: string;
    stock: number;
    barcode?: string;
    price_modifier: number;
}

export interface ProductUnit {
    id: string;
    product_id: string;
    size_id?: string | null;
    individual_barcode: string;
    status: 'available' | 'sold' | 'reserved';
    created_at?: string;
}

export interface ProductDetails {
    id: string;
    name: string;
    base_price?: number;
    promo_price?: number;
    brand?: string;
    barcode?: string;
}

interface IndividualUnitsManagerProps {
    productId: string;
    productName: string;
    totalStock?: number;
    product?: ProductDetails;
    onClose?: () => void;
}

let counter = 0;
export const generateBarcode = () => {
    counter = (counter + 1) % 900;
    const timePart = Date.now().toString().slice(-6);
    const randomPart = Math.floor(100 + Math.random() * 900);
    return `20${timePart}${randomPart}`;
};

export default function IndividualUnitsManager({ productId, productName, product: initialProduct, onClose }: IndividualUnitsManagerProps) {
    const { t } = useLanguage();
    const { profile } = useAuth();
    const isCashier = profile?.role === 'cashier';

    const [sizes, setSizes] = useState<ProductSize[]>([]);
    const [units, setUnits] = useState<ProductUnit[]>([]);
    const [productDetails, setProductDetails] = useState<ProductDetails>(initialProduct || {
        id: productId,
        name: productName,
    });
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);

    // Collapsed/Expanded sizes state (all expanded by default)
    const [expandedSizes, setExpandedSizes] = useState<Record<string, boolean>>({});

    // Label modal state
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [selectedUnitForPrint, setSelectedUnitForPrint] = useState<string | undefined>(undefined);
    const [selectedSizeForPrint, setSelectedSizeForPrint] = useState<string | undefined>(undefined);

    // Add New Size Form State
    const [newSizeName, setNewSizeName] = useState('');
    const [newSizeStock, setNewSizeStock] = useState('1');

    // Scanner State
    const [showScanner, setShowScanner] = useState(false);
    const [scanTargetUnitId, setScanTargetUnitId] = useState<string | null>(null);

    // Auxiliar para registrar movimientos de stock
    const logStockMovement = async (pId: string, quantity: number, type: 'manual_add' | 'manual_deduct' | 'sale' | 'return' | 'correction', sizeId?: string, reason?: string) => {
        if (quantity === 0) return;
        try {
            await supabase.from('stock_movements').insert({
                product_id: pId,
                size_id: sizeId,
                quantity,
                type,
                reason: reason || '',
                employee_id: profile?.id
            });
        } catch (err) {
            console.error('Error logging stock movement:', err);
        }
    };

    useEffect(() => {
        fetchData();
    }, [productId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch product details
            const { data: prodData } = await supabase
                .from('products')
                .select('id, name, base_price, promo_price, brand, barcode')
                .eq('id', productId)
                .single();

            if (prodData) {
                setProductDetails(prodData);
            }

            // 2. Fetch sizes
            const { data: sizesData, error: sizesError } = await supabase
                .from('product_sizes')
                .select('*')
                .eq('product_id', productId)
                .order('size_name');

            if (sizesError) throw sizesError;
            const currentSizes = sizesData || [];
            setSizes(currentSizes);

            // Expand all sizes by default
            const initialExpanded: Record<string, boolean> = {};
            currentSizes.forEach(s => { initialExpanded[s.id] = true; });
            setExpandedSizes(initialExpanded);

            // 3. Fetch individual units
            let currentUnits: ProductUnit[] = [];
            const { data: unitsData, error: unitsError } = await supabase
                .from('product_units')
                .select('*')
                .eq('product_id', productId)
                .eq('status', 'available')
                .order('created_at', { ascending: true });

            if (!unitsError && unitsData) {
                currentUnits = unitsData;
            }

            // 4. Automatic synchronization: ensure every physical unit in stock has a unit record with a unique barcode
            let needsReload = false;
            for (const size of currentSizes) {
                const unitsForThisSize = currentUnits.filter(u => u.size_id === size.id);
                const missingCount = size.stock - unitsForThisSize.length;

                if (missingCount > 0) {
                    const newUnitsToInsert: any[] = [];
                    for (let i = 0; i < missingCount; i++) {
                        // If size had a barcode and this is unit 0, preserve it; otherwise generate unique code
                        const barcode = (i === 0 && size.barcode && !unitsForThisSize.some(u => u.individual_barcode === size.barcode))
                            ? size.barcode
                            : generateBarcode();

                        newUnitsToInsert.push({
                            product_id: productId,
                            size_id: size.id,
                            individual_barcode: barcode,
                            status: 'available'
                        });
                    }

                    if (newUnitsToInsert.length > 0) {
                        const { error: insErr } = await supabase
                            .from('product_units')
                            .insert(newUnitsToInsert);

                        if (!insErr) {
                            needsReload = true;
                        } else {
                            console.warn('⚠️ Error inserting units automatically:', insErr);
                        }
                    }
                }
            }

            if (needsReload) {
                const { data: reloadedUnits } = await supabase
                    .from('product_units')
                    .select('*')
                    .eq('product_id', productId)
                    .eq('status', 'available')
                    .order('created_at', { ascending: true });

                if (reloadedUnits) {
                    currentUnits = reloadedUnits;
                }
            }

            setUnits(currentUnits);

            // 5. Sincronizar stock total en la tabla maestra products
            await syncProductTotalStock(currentSizes);
        } catch (error: any) {
            console.error('Error fetching units data:', error);
            toast.error(t('Error al cargar datos del producto'));
        } finally {
            setLoading(false);
        }
    };

    // Sincroniza el campo stock de la tabla products con la suma de las tallas actuales
    const syncProductTotalStock = async (currentSizes: ProductSize[]) => {
        const total = currentSizes.reduce((sum, s) => sum + (s.stock || 0), 0);
        try {
            const { error: pErr } = await supabase
                .from('products')
                .update({ stock: total })
                .eq('id', productId);
            if (pErr) console.warn('⚠️ Error updating products.stock:', pErr);
        } catch (e) {
            console.error('Error syncing products.stock:', e);
        }
    };

    // Toggle size expand/collapse
    const toggleExpandSize = (sizeId: string) => {
        setExpandedSizes(prev => ({ ...prev, [sizeId]: !prev[sizeId] }));
    };

    // Add a new size with its initial units and unique barcodes
    const handleAddSize = async () => {
        if (!newSizeName.trim()) {
            toast.error(t('Nombre de talla obligatorio'));
            return;
        }

        const stockVal = isCashier ? 0 : parseInt(newSizeStock);
        if (!isCashier && (isNaN(stockVal) || stockVal < 0)) {
            toast.error(t('Stock inválido'));
            return;
        }

        setProcessing(true);
        try {
            // Check duplicates
            if (sizes.some(s => s.size_name.toLowerCase() === newSizeName.trim().toLowerCase())) {
                toast.error(t('Ya existe una talla con ese nombre'));
                setProcessing(false);
                return;
            }

            // Create size in product_sizes
            const { data: createdSize, error: sizeErr } = await supabase
                .from('product_sizes')
                .insert({
                    product_id: productId,
                    size_name: newSizeName.trim(),
                    stock: stockVal,
                    price_modifier: 0
                })
                .select()
                .single();

            if (sizeErr) throw sizeErr;

            // Create individual units for this size, each with its own barcode
            const unitsToInsert: any[] = [];
            for (let i = 0; i < stockVal; i++) {
                unitsToInsert.push({
                    product_id: productId,
                    size_id: createdSize.id,
                    individual_barcode: generateBarcode(),
                    status: 'available'
                });
            }

            let insertedUnits: ProductUnit[] = [];
            if (unitsToInsert.length > 0) {
                const { data: uData, error: uErr } = await supabase
                    .from('product_units')
                    .insert(unitsToInsert)
                    .select();

                if (!uErr && uData) {
                    insertedUnits = uData;
                }
            }

            const nextSizes = [...sizes, createdSize];
            setSizes(nextSizes);
            setUnits([...units, ...insertedUnits]);
            setExpandedSizes(prev => ({ ...prev, [createdSize.id]: true }));

            // Sincronizar stock en products
            await syncProductTotalStock(nextSizes);

            setNewSizeName('');
            setNewSizeStock('1');

            toast.success(t(`Talla agregada con ${stockVal} unidades y códigos individuales`));

            if (stockVal > 0) {
                await logStockMovement(productId, stockVal, 'manual_add', createdSize.id, t('Stock inicial de talla'));
            }
        } catch (error: any) {
            console.error('Error adding size:', error);
            toast.error(t('Error al agregar talla: ') + error.message);
        } finally {
            setProcessing(false);
        }
    };

    // Actualizar directamente la cantidad de stock de una talla
    const handleUpdateSizeStock = async (sizeId: string, newStock: number) => {
        if (isCashier) {
            toast.error(t('Solo administradores pueden modificar el stock'));
            return;
        }

        if (isNaN(newStock) || newStock < 0) {
            toast.error(t('Stock inválido'));
            return;
        }

        const targetSize = sizes.find(s => s.id === sizeId);
        if (!targetSize || targetSize.stock === newStock) return;

        setProcessing(true);
        try {
            const diff = newStock - targetSize.stock;

            // 1. Actualizar product_sizes
            const { error: sErr } = await supabase
                .from('product_sizes')
                .update({ stock: newStock })
                .eq('id', sizeId);

            if (sErr) throw sErr;

            // 2. Ajustar product_units
            if (diff > 0) {
                const newUnitsToInsert: any[] = [];
                for (let i = 0; i < diff; i++) {
                    newUnitsToInsert.push({
                        product_id: productId,
                        size_id: sizeId,
                        individual_barcode: generateBarcode(),
                        status: 'available'
                    });
                }
                const { data: insertedU } = await supabase
                    .from('product_units')
                    .insert(newUnitsToInsert)
                    .select();

                if (insertedU) {
                    setUnits(prev => [...prev, ...insertedU]);
                }
                await logStockMovement(productId, diff, 'manual_add', sizeId, `${t('Stock aumentado en talla')}: ${targetSize.size_name}`);
            } else if (diff < 0) {
                const sizeUnits = units.filter(u => u.size_id === sizeId);
                const toRemove = sizeUnits.slice(diff);
                const toRemoveIds = toRemove.map(u => u.id);

                if (toRemoveIds.length > 0) {
                    await supabase
                        .from('product_units')
                        .delete()
                        .in('id', toRemoveIds);

                    setUnits(prev => prev.filter(u => !toRemoveIds.includes(u.id)));
                }
                await logStockMovement(productId, diff, 'manual_deduct', sizeId, `${t('Stock reducido en talla')}: ${targetSize.size_name}`);
            }

            // 3. Actualizar estado local y sincronizar products.stock
            const nextSizes = sizes.map(s => s.id === sizeId ? { ...s, stock: newStock } : s);
            setSizes(nextSizes);
            await syncProductTotalStock(nextSizes);

            toast.success(t('Stock actualizado a ') + newStock);
        } catch (err: any) {
            console.error('Error updating size stock:', err);
            toast.error(t('Error al actualizar stock: ') + err.message);
        } finally {
            setProcessing(false);
        }
    };

    // Add a single unit to a size
    const handleAddUnitToSize = async (sizeId: string) => {
        if (isCashier) {
            toast.error(t('Solo administradores pueden añadir unidades de stock'));
            return;
        }

        setProcessing(true);
        try {
            const targetSize = sizes.find(s => s.id === sizeId);
            if (!targetSize) return;

            const newCode = generateBarcode();
            const { data: newUnit, error: uErr } = await supabase
                .from('product_units')
                .insert({
                    product_id: productId,
                    size_id: sizeId,
                    individual_barcode: newCode,
                    status: 'available'
                })
                .select()
                .single();

            if (uErr) throw uErr;

            // Increment size stock
            const newStock = targetSize.stock + 1;
            await supabase
                .from('product_sizes')
                .update({ stock: newStock })
                .eq('id', sizeId);

            await logStockMovement(productId, 1, 'manual_add', sizeId, t('Prenda individual agregada'));

            const nextSizes = sizes.map(s => s.id === sizeId ? { ...s, stock: newStock } : s);
            setSizes(nextSizes);
            setUnits([...units, newUnit]);
            setExpandedSizes(prev => ({ ...prev, [sizeId]: true }));

            // Sincronizar stock total
            await syncProductTotalStock(nextSizes);

            toast.success(t('Nueva unidad creada con código: ') + newCode);
        } catch (err: any) {
            console.error('Error adding unit:', err);
            toast.error(t('Error al añadir unidad: ') + err.message);
        } finally {
            setProcessing(false);
        }
    };

    // Update individual unit barcode
    const handleUpdateUnitBarcode = async (unitId: string, newBarcode: string) => {
        const cleanBarcode = newBarcode.trim();
        if (!cleanBarcode) {
            toast.error(t('El código no puede estar vacío'));
            return;
        }

        try {
            const { error } = await supabase
                .from('product_units')
                .update({ individual_barcode: cleanBarcode })
                .eq('id', unitId);

            if (error) throw error;

            setUnits(units.map(u => u.id === unitId ? { ...u, individual_barcode: cleanBarcode } : u));
            toast.success(t('Código guardado: ') + cleanBarcode);
        } catch (err: any) {
            console.error('Error updating barcode:', err);
            toast.error(t('Error al guardar código: ') + err.message);
        }
    };

    // Generate fresh barcode for a single unit
    const handleGenerateBarcodeForUnit = async (unitId: string) => {
        const newCode = generateBarcode();
        await handleUpdateUnitBarcode(unitId, newCode);
    };

    // Delete a single individual unit
    const handleDeleteUnit = async (unitId: string, sizeId: string) => {
        if (isCashier) {
            toast.error(t('No tienes permisos para eliminar unidades'));
            return;
        }

        if (!confirm(t('¿Eliminar esta prenda del stock?'))) return;

        try {
            const { error: delErr } = await supabase
                .from('product_units')
                .delete()
                .eq('id', unitId);

            if (delErr) throw delErr;

            const targetSize = sizes.find(s => s.id === sizeId);
            let nextSizes = sizes;
            if (targetSize && targetSize.stock > 0) {
                const newStock = Math.max(0, targetSize.stock - 1);
                await supabase
                    .from('product_sizes')
                    .update({ stock: newStock })
                    .eq('id', sizeId);

                await logStockMovement(productId, -1, 'manual_deduct', sizeId, t('Prenda individual eliminada'));
                nextSizes = sizes.map(s => s.id === sizeId ? { ...s, stock: newStock } : s);
                setSizes(nextSizes);
            }

            setUnits(units.filter(u => u.id !== unitId));
            await syncProductTotalStock(nextSizes);

            toast.success(t('Prenda eliminada del inventario'));
        } catch (err: any) {
            console.error('Error deleting unit:', err);
            toast.error(t('Error al eliminar unidad'));
        }
    };

    // Generate unique barcodes for ALL units that are missing a barcode
    const handleGenerateAllMissingBarcodes = async () => {
        setProcessing(true);
        try {
            // Find units with empty or placeholder barcodes
            const unitsMissing = units.filter(u => !u.individual_barcode || u.individual_barcode.trim() === '');
            
            // Also check if any size needs units created
            let createdCount = 0;
            const newUnitsToInsert: any[] = [];

            for (const size of sizes) {
                const currentSizeUnits = units.filter(u => u.size_id === size.id);
                const diff = size.stock - currentSizeUnits.length;
                if (diff > 0) {
                    for (let i = 0; i < diff; i++) {
                        newUnitsToInsert.push({
                            product_id: productId,
                            size_id: size.id,
                            individual_barcode: generateBarcode(),
                            status: 'available'
                        });
                        createdCount++;
                    }
                }
            }

            if (newUnitsToInsert.length > 0) {
                await supabase.from('product_units').insert(newUnitsToInsert);
            }

            // Update existing units without barcode
            const updatedUnits = [...units];
            for (const u of unitsMissing) {
                const newCode = generateBarcode();
                await supabase
                    .from('product_units')
                    .update({ individual_barcode: newCode })
                    .eq('id', u.id);

                const idx = updatedUnits.findIndex(item => item.id === u.id);
                if (idx >= 0) {
                    updatedUnits[idx] = { ...updatedUnits[idx], individual_barcode: newCode };
                }
            }

            // Reload all units to reflect everything
            const { data: finalUnits } = await supabase
                .from('product_units')
                .select('*')
                .eq('product_id', productId)
                .eq('status', 'available')
                .order('created_at', { ascending: true });

            if (finalUnits) {
                setUnits(finalUnits);
            }

            const totalGenerated = unitsMissing.length + createdCount;
            toast.success(t(`¡Generados ${totalGenerated || units.length} códigos de barras únicos!`));
        } catch (err: any) {
            console.error('Error generating barcodes:', err);
            toast.error(t('Error al generar códigos de barras'));
        } finally {
            setProcessing(false);
        }
    };

    // Delete entire size
    const handleDeleteSize = async (sizeId: string) => {
        if (!confirm(t('¿Estás seguro de eliminar esta talla y todas sus unidades?'))) return;

        try {
            const sizeToDelete = sizes.find(s => s.id === sizeId);

            // Delete units of this size
            await supabase.from('product_units').delete().eq('size_id', sizeId);

            // Delete size
            const { error } = await supabase
                .from('product_sizes')
                .delete()
                .eq('id', sizeId);

            if (error) throw error;

            if (sizeToDelete && sizeToDelete.stock > 0) {
                await logStockMovement(productId, -sizeToDelete.stock, 'manual_deduct', undefined, `${t('Talla eliminada')}: ${sizeToDelete.size_name}`);
            }

            const nextSizes = sizes.filter(s => s.id !== sizeId);
            setSizes(nextSizes);
            setUnits(units.filter(u => u.size_id !== sizeId));
            await syncProductTotalStock(nextSizes);

            toast.success(t('Talla eliminada y stock actualizado'));
        } catch (error) {
            console.error('Error deleting size:', error);
            toast.error(t('Error al eliminar talla'));
        }
    };

    // Scanner callback
    const handleScanSuccess = (code: string) => {
        setShowScanner(false);
        if (scanTargetUnitId) {
            handleUpdateUnitBarcode(scanTargetUnitId, code);
        }
    };

    // Map units to print format for BarcodeLabelModal
    const printUnitsList: IndividualUnitItem[] = units.map((u) => {
        const sz = sizes.find(s => s.id === u.size_id);
        const unitsInSameSize = units.filter(item => item.size_id === u.size_id);
        const unitIndex = unitsInSameSize.findIndex(item => item.id === u.id) + 1;
        return {
            id: u.id,
            size_id: u.size_id || undefined,
            size_name: sz?.size_name || 'Standard',
            barcode: u.individual_barcode,
            unit_number: unitIndex
        };
    });

    const totalStockCount = sizes.reduce((sum, s) => sum + (s.stock || 0), 0);
    const missingBarcodesCount = units.filter(u => !u.individual_barcode || u.individual_barcode.trim() === '').length +
        sizes.reduce((sum, s) => {
            const existing = units.filter(u => u.size_id === s.id).length;
            return sum + Math.max(0, s.stock - existing);
        }, 0);

    if (loading) {
        return (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-amber-500"></div>
                <span className="text-xs text-gray-500">{t('Cargando unidades y códigos individuales...')}</span>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Header banner with Action Buttons */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 p-4 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-2xs">
                <div>
                    <div className="flex items-center gap-2">
                        <Tag className="w-5 h-5 text-amber-600" />
                        <h3 className="font-extrabold text-amber-950 text-base">{productName}</h3>
                        <span className="text-xs font-bold bg-amber-200/70 text-amber-900 px-2 py-0.5 rounded-full">
                            {totalStockCount} {t('unidades en stock')}
                        </span>
                    </div>
                    <p className="text-xs text-amber-800 mt-0.5">
                        {t('Cada prenda física tiene su propio código de barras único para control individual y venta en POS.')}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                        type="button"
                        onClick={handleGenerateAllMissingBarcodes}
                        disabled={processing || totalStockCount === 0}
                        className="px-3.5 py-2 bg-white border border-amber-300 hover:bg-amber-100/70 text-amber-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95 disabled:opacity-50"
                        title={t('Generar códigos únicos para todas las prendas')}
                    >
                        <Sparkles className="w-4 h-4 text-amber-600" />
                        <span>
                            {missingBarcodesCount > 0
                                ? t(`Generar ${missingBarcodesCount} Códigos`)
                                : t('Regenerar Todos los Códigos')}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setSelectedUnitForPrint(undefined);
                            setSelectedSizeForPrint(undefined);
                            setShowLabelModal(true);
                        }}
                        disabled={units.length === 0}
                        className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                        title={t('Imprimir etiquetas adhesivas con código de barras para cada prenda')}
                    >
                        <Printer className="w-4 h-4" />
                        <span>{t('Imprimir Etiquetas')} ({units.length})</span>
                    </button>
                </div>
            </div>

            {/* Cashier restriction banner */}
            {isCashier && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-3 text-xs text-blue-800">
                    <Lock className="w-4 h-4 flex-shrink-0 text-blue-600" />
                    <span>{t('Puedes escanear o editar códigos y reimprimir etiquetas. La adición o eliminación de stock físico requiere rol administrador.')}</span>
                </div>
            )}

            {/* Add New Size Form */}
            <div className="bg-white border border-gray-200/80 rounded-2xl p-4 shadow-2xs">
                <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider mb-3 flex items-center justify-between">
                    <span>{t('Agregar Nueva Talla')}</span>
                    <span className="text-[11px] text-amber-700 font-medium lowercase">
                        {t('se crearán códigos individuales automáticamente')}
                    </span>
                </h4>
                <div className="flex flex-col sm:flex-row gap-2.5 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('Nombre de Talla (ej: XL, 42, Standar)')}</label>
                        <input
                            type="text"
                            value={newSizeName}
                            onChange={e => setNewSizeName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 text-sm font-semibold"
                            placeholder="XL"
                        />
                    </div>
                    <div className="w-full sm:w-32">
                        <label className="block text-xs font-medium text-gray-500 mb-1">{t('Cantidad (Stock)')}</label>
                        <input
                            type="number"
                            value={isCashier ? '0' : newSizeStock}
                            disabled={isCashier}
                            onChange={e => setNewSizeStock(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 text-sm font-extrabold text-center"
                            min="0"
                        />
                    </div>
                    <button
                        onClick={handleAddSize}
                        disabled={processing || !newSizeName.trim()}
                        className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 font-bold text-sm shadow-sm transition-all flex-shrink-0 active:scale-95"
                    >
                        <Plus className="w-4 h-4" />
                        <span>{t('Agregar Talla')}</span>
                    </button>
                </div>
            </div>

            {/* Sizes & Individual Units List */}
            <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                    <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider">
                        {t('Tallas y Prendas Individuales')} ({sizes.length})
                    </h4>
                    <span className="text-[11px] text-gray-500">
                        {units.length} {t('prendas con código individual')}
                    </span>
                </div>

                {sizes.length === 0 ? (
                    <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center text-gray-400 italic text-sm">
                        {t('No hay tallas registradas para este producto. Agrega una talla arriba para generar sus códigos.')}
                    </div>
                ) : (
                    sizes.map((size) => {
                        const sizeUnits = units.filter(u => u.size_id === size.id);
                        const isExpanded = expandedSizes[size.id] !== false;

                        return (
                            <div key={size.id} className="bg-white border border-gray-200/90 rounded-2xl overflow-hidden shadow-2xs">
                                {/* Size Header Bar */}
                                <div className="bg-gray-50/90 px-4 py-3 border-b border-gray-200/70 flex flex-wrap items-center justify-between gap-3">
                                    <div
                                        className="flex items-center gap-2.5 cursor-pointer select-none"
                                        onClick={() => toggleExpandSize(size.id)}
                                    >
                                        <button
                                            type="button"
                                            className="p-1 rounded hover:bg-gray-200 text-gray-500"
                                        >
                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                        </button>
                                        <div className="font-extrabold text-sm text-gray-900 bg-white border border-gray-200 px-3 py-1 rounded-xl shadow-2xs">
                                            {size.size_name}
                                        </div>
                                        <div 
                                            className="flex items-center gap-1.5 bg-white border border-gray-300 rounded-xl px-2.5 py-1 shadow-2xs"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{t('Stock')}:</span>
                                            <input
                                                type="number"
                                                min="0"
                                                defaultValue={size.stock}
                                                key={`${size.id}-${size.stock}`}
                                                disabled={isCashier}
                                                onBlur={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    if (!isNaN(val) && val !== size.stock) {
                                                        handleUpdateSizeStock(size.id, val);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const val = parseInt((e.target as HTMLInputElement).value);
                                                        if (!isNaN(val) && val !== size.stock) {
                                                            handleUpdateSizeStock(size.id, val);
                                                            (e.target as HTMLInputElement).blur();
                                                        }
                                                    }
                                                }}
                                                className="w-14 text-center font-black text-xs text-gray-900 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100 disabled:cursor-not-allowed py-0.5"
                                                title={t('Modificar cantidad de stock para esta talla')}
                                            />
                                        </div>
                                    </div>

                                    {/* Size Actions */}
                                    <div className="flex items-center gap-2">
                                        {!isCashier && (
                                            <button
                                                type="button"
                                                onClick={() => handleAddUnitToSize(size.id)}
                                                className="px-2.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors"
                                                title={t('Añadir una unidad más a esta talla')}
                                            >
                                                <Plus className="w-3.5 h-3.5 text-amber-600" />
                                                <span>{t('+1 Unidad')}</span>
                                            </button>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedSizeForPrint(size.id);
                                                setSelectedUnitForPrint(undefined);
                                                setShowLabelModal(true);
                                            }}
                                            disabled={sizeUnits.length === 0}
                                            className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 border border-amber-300/80 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50"
                                            title={t('Imprimir etiquetas para todas las prendas de esta talla')}
                                        >
                                            <Printer className="w-3.5 h-3.5 text-amber-600" />
                                            <span>{t('Imprimir Talla')}</span>
                                        </button>

                                        {!isCashier && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteSize(size.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title={t('Eliminar talla')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Size Individual Units List */}
                                {isExpanded && (
                                    <div className="p-3 bg-white divide-y divide-gray-100">
                                        {sizeUnits.length === 0 ? (
                                            <div className="py-4 px-3 text-center text-xs text-gray-400">
                                                {t('No hay unidades registradas para esta talla. Haz clic en "+1 Unidad" o "Generar Códigos".')}
                                            </div>
                                        ) : (
                                            sizeUnits.map((unit, idx) => (
                                                <div
                                                    key={unit.id}
                                                    className="py-2.5 px-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 hover:bg-amber-50/30 rounded-xl transition-colors"
                                                >
                                                    {/* Unit Label */}
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-900 text-xs font-black flex items-center justify-center flex-shrink-0">
                                                            {idx + 1}
                                                        </span>
                                                        <span className="text-xs font-bold text-gray-700">
                                                            {t('Prenda')} #{idx + 1}
                                                        </span>
                                                    </div>

                                                    {/* Barcode input & Generation */}
                                                    <div className="flex-1 w-full sm:max-w-md flex items-center gap-1.5">
                                                        <div className="relative flex-1">
                                                            <input
                                                                type="text"
                                                                value={unit.individual_barcode || ''}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setUnits(units.map(u => u.id === unit.id ? { ...u, individual_barcode: val } : u));
                                                                }}
                                                                onBlur={(e) => {
                                                                    const val = e.target.value.trim();
                                                                    if (val && val !== unit.individual_barcode) {
                                                                        handleUpdateUnitBarcode(unit.id, val);
                                                                    }
                                                                }}
                                                                placeholder={t('Código de barras único')}
                                                                className="w-full px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-xl font-mono text-xs font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-amber-500 shadow-2xs"
                                                            />
                                                        </div>

                                                        <button
                                                            type="button"
                                                            onClick={() => handleGenerateBarcodeForUnit(unit.id)}
                                                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl transition-colors active:scale-95 flex-shrink-0"
                                                            title={t('Generar nuevo código para esta prenda')}
                                                        >
                                                            <Sparkles className="w-4 h-4 text-amber-600" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setScanTargetUnitId(unit.id);
                                                                setShowScanner(true);
                                                            }}
                                                            className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors active:scale-95 flex-shrink-0"
                                                            title={t('Escanear con cámara')}
                                                        >
                                                            <ScanBarcode className="w-4 h-4" />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedUnitForPrint(unit.id);
                                                                setSelectedSizeForPrint(undefined);
                                                                setShowLabelModal(true);
                                                            }}
                                                            className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors active:scale-95 flex-shrink-0"
                                                            title={t('Imprimir etiqueta de esta prenda')}
                                                        >
                                                            <Printer className="w-4 h-4" />
                                                        </button>

                                                        {!isCashier && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteUnit(unit.id, size.id)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors flex-shrink-0"
                                                                title={t('Eliminar esta prenda')}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Scanner Modal */}
            {showScanner && (
                <BarcodeScanner
                    onScanSuccess={handleScanSuccess}
                    onClose={() => setShowScanner(false)}
                />
            )}

            {/* Barcode Label Modal */}
            {showLabelModal && (
                <BarcodeLabelModal
                    isOpen={showLabelModal}
                    onClose={() => setShowLabelModal(false)}
                    product={productDetails}
                    sizes={sizes}
                    units={printUnitsList}
                    initialSelectedUnitId={selectedUnitForPrint}
                    initialSelectedSizeId={selectedSizeForPrint}
                    onUpdateUnitBarcode={async (unitId, newCode) => {
                        await handleUpdateUnitBarcode(unitId, newCode);
                    }}
                />
            )}
        </div>
    );
}
