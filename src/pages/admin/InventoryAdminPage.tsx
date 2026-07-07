import { useCallback, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import {
  Archive,
  Bell,
  Boxes,
  ClipboardCheck,
  Download,
  Layers,
  Package,
  PackageMinus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Tags,
  Truck,
  Warehouse,
} from "lucide-react";

import { InventorySupplierOrdersPanel } from "../../components/admin/InventorySupplierOrdersPanel";
import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { boliviaCities } from "../../data/cities";
import { useAuth } from "../../hooks/useAuth";
import { canSoftDelete, hardDeleteRecord, restoreRecord, softDeleteRecord, type DeletableTable, type DeletionMetadata } from "../../services/adminDeletionService";
import {
  createInventoryCategory,
  createInventoryItem,
  createInventoryLocation,
  createInventoryLot,
  createInventorySupplier,
  createInventoryUnit,
  closeInventoryShift,
  getInventoryCategories,
  getInventoryClinicalUsages,
  getInventoryCountLines,
  getInventoryCounts,
  getInventoryItems,
  getInventoryLocations,
  getInventoryLots,
  getInventoryMovements,
  getInventorySuppliers,
  getInventoryUnits,
  openInventoryShift,
  recordInventoryCountLine,
  recordInventoryMovement,
  reopenInventoryShift,
  updateInventoryCategory,
  updateInventoryItem,
  updateInventoryLocation,
  updateInventoryLot,
  updateInventoryShiftLine,
  updateInventorySupplier,
  updateInventoryUnit,
  type InventoryCategoryRow,
  type InventoryClinicalUsageRow,
  type InventoryCountLineRow,
  type InventoryCountRow,
  type InventoryItemRow,
  type InventoryLocationRow,
  type InventoryLotRow,
  type InventoryMovementRow,
  type InventorySupplierRow,
  type InventoryUnitRow,
} from "../../services/inventoryService";
import { downloadCsv } from "../../utils/csv";
import { formatDate, formatMoney } from "../../utils/text";

type TabKey = "resumen" | "items" | "categorias" | "lotes" | "movimientos" | "conteos" | "alertas" | "reportes" | "proveedores" | "pedidos";
type ModalKey = "item" | "category" | "unit" | "supplier" | "location" | "lot" | "movement" | "count" | "shift" | null;
type ShiftLineDraft = { counted_stock: number; notes: string };
type InternalUsageDraft = { id: string; item_id: string; lot_id: string; quantity: number; reason: string };
type ReportPeriod = "day" | "week" | "month" | "custom";
type ReportRange = { startDate: string; endDate: string };
type InventoryUsageReportRow = {
  id: string;
  date: string;
  itemId: string;
  itemName: string;
  category: string;
  reportType: "Entrada" | "Uso paciente" | "Uso interno" | "Merma" | "Transferencia" | "Ajuste" | "Diferencia de cierre";
  quantity: number;
  unitLabel: string;
  lotLabel: string;
  responsible: string;
  patient: string;
  notes: string;
  estimatedCost: number | null;
};
type InventoryUsageSummaryRow = {
  key: string;
  itemName: string;
  unitLabel: string;
  patientQuantity: number;
  internalQuantity: number;
  wasteQuantity: number;
  totalQuantity: number;
  estimatedCost: number;
};
type InventoryCountReportRow = {
  id: string;
  date: string;
  shiftName: string;
  itemName: string;
  openingStock: number;
  expectedStock: number;
  countedStock: number;
  differenceStock: number;
  unitLabel: string;
  countedBy: string;
  openedBy: string;
  closedBy: string;
  notes: string;
};
type InventoryResponsibleReportRow = {
  responsable: string;
  movimientos: number;
  conteos: number;
  valor_consumido: number;
};

const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "resumen", label: "Resumen", icon: <Boxes className="h-4 w-4" /> },
  { key: "items", label: "Items / Insumos", icon: <Package className="h-4 w-4" /> },
  { key: "categorias", label: "Categorías", icon: <Layers className="h-4 w-4" /> },
  { key: "lotes", label: "Lotes", icon: <Tags className="h-4 w-4" /> },
  { key: "movimientos", label: "Movimientos", icon: <Warehouse className="h-4 w-4" /> },
  { key: "conteos", label: "Turnos", icon: <ClipboardCheck className="h-4 w-4" /> },
  { key: "alertas", label: "Alertas", icon: <Bell className="h-4 w-4" /> },
  { key: "reportes", label: "Reportes", icon: <Download className="h-4 w-4" /> },
  { key: "proveedores", label: "Proveedores", icon: <Truck className="h-4 w-4" /> },
  { key: "pedidos", label: "Pedidos", icon: <ShoppingCart className="h-4 w-4" /> },
];

const emptyItemForm = {
  name: "",
  item_type: "insumo",
  category_id: "",
  sku: "",
  barcode: "",
  unit_id: "",
  presentation_unit_id: "",
  city: "",
  location_id: "",
  supplier_id: "",
  current_stock: 0,
  minimum_stock: 0,
  units_per_presentation: 1,
  current_stock_presentations: 0,
  minimum_stock_presentations: 0,
  reference_cost: 0,
  sale_price: 0,
  lot_number: "",
  expiration_date: "",
  alert_days_before_expiration: 30,
  notes: "",
  is_active: true,
};

const emptyCategoryForm = { name: "", description: "", is_active: true };
const emptyLocationForm = { name: "", city: "", description: "", is_active: true };
const emptySupplierForm = {
  name: "",
  contact_name: "",
  phone: "",
  whatsapp_phone: "",
  email: "",
  address: "",
  tax_id: "",
  payment_terms_days: 0,
  allows_consignment: false,
  notes: "",
  is_active: true,
};
const emptyUnitForm = {
  name: "",
  abbreviation: "",
  unit_type: "unidad" as InventoryUnitRow["unit_type"],
  is_base_unit: false,
  base_unit_id: "",
  conversion_factor: 1,
  is_active: true,
};
const emptyLotForm = {
  item_id: "",
  lot_number: "",
  supplier_id: "",
  location_id: "",
  presentation_unit_id: "",
  received_date: new Date().toISOString().slice(0, 10),
  expiration_date: "",
  initial_quantity: 0,
  current_quantity: 0,
  units_per_presentation: 1,
  initial_quantity_presentations: 0,
  current_quantity_presentations: 0,
  unit_cost: 0,
  notes: "",
  is_active: true,
};
const emptyMovementForm = {
  item_id: "",
  lot_id: "",
  movement_type: "entrada" as InventoryMovementRow["movement_type"],
  quantity: 0,
  unit_cost: 0,
  from_location_id: "",
  to_location_id: "",
  supplier_id: "",
  reference: "",
  reason: "",
  movement_date: new Date().toISOString().slice(0, 16),
};
const emptyCountForm = {
  item_id: "",
  counted_stock: 0,
  location_id: "",
  notes: "",
  count_date: new Date().toISOString().slice(0, 10),
};
const emptyShiftForm = {
  shift_name: "",
  location_id: "",
  notes: "",
  count_date: new Date().toISOString().slice(0, 10),
};

export function InventoryAdminPage() {
  const { role, profile, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("resumen");
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [units, setUnits] = useState<InventoryUnitRow[]>([]);
  const [suppliers, setSuppliers] = useState<InventorySupplierRow[]>([]);
  const [locations, setLocations] = useState<InventoryLocationRow[]>([]);
  const [lots, setLots] = useState<InventoryLotRow[]>([]);
  const [movements, setMovements] = useState<InventoryMovementRow[]>([]);
  const [clinicalUsages, setClinicalUsages] = useState<InventoryClinicalUsageRow[]>([]);
  const [counts, setCounts] = useState<InventoryCountRow[]>([]);
  const [countLines, setCountLines] = useState<InventoryCountLineRow[]>([]);
  const [query, setQuery] = useState("");
  const [movementQuery, setMovementQuery] = useState("");
  const [modal, setModal] = useState<ModalKey>(null);
  const [editing, setEditing] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "error"; text: string } | null>(null);
  const [shiftStatus, setShiftStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [shiftLineDrafts, setShiftLineDrafts] = useState<Record<string, ShiftLineDraft>>({});
  const [closingNotesByShift, setClosingNotesByShift] = useState<Record<string, string>>({});
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("week");
  const [reportStartDate, setReportStartDate] = useState(() => getDefaultReportRange("week").startDate);
  const [reportEndDate, setReportEndDate] = useState(() => getDefaultReportRange("week").endDate);
  const [movementSearch, setMovementSearch] = useState("");
  const [internalUsageDrafts, setInternalUsageDrafts] = useState<InternalUsageDraft[]>([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [lotForm, setLotForm] = useState(emptyLotForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);
  const [countForm, setCountForm] = useState(emptyCountForm);
  const [shiftForm, setShiftForm] = useState(emptyShiftForm);

  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;
  const canManageInventoryCorrections = role === "superadmin" || role === "admin";
  const includeDeleted = canManageInventoryCorrections;

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const unitMap = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const locationMap = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const countLinesByCount = useMemo(() => {
    const map = new Map<string, InventoryCountLineRow[]>();
    countLines.forEach((line) => {
      const rows = map.get(line.count_id) ?? [];
      rows.push(line);
      map.set(line.count_id, rows);
    });
    return map;
  }, [countLines]);
  const countMap = useMemo(() => new Map(counts.map((count) => [count.id, count])), [counts]);
  const usageByMovement = useMemo(() => {
    const map = new Map<string, InventoryClinicalUsageRow>();
    clinicalUsages.forEach((usage) => {
      if (usage.inventory_movement_id) map.set(usage.inventory_movement_id, usage);
    });
    return map;
  }, [clinicalUsages]);
  const usageMovementIds = useMemo(
    () => new Set(clinicalUsages.map((usage) => usage.inventory_movement_id).filter((id): id is string => Boolean(id))),
    [clinicalUsages]
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      getInventoryItems(includeDeleted),
      getInventoryCategories(includeDeleted),
      getInventoryUnits(includeDeleted),
      getInventorySuppliers(includeDeleted),
      getInventoryLocations(includeDeleted),
      getInventoryLots(includeDeleted),
      getInventoryMovements(includeDeleted),
      getInventoryClinicalUsages(includeDeleted),
      getInventoryCounts(includeDeleted),
      getInventoryCountLines(),
    ])
      .then(([itemRows, categoryRows, unitRows, supplierRows, locationRows, lotRows, movementRows, usageRows, countRows, countLineRows]) => {
        setItems(itemRows);
        setCategories(categoryRows);
        setUnits(unitRows);
        setSuppliers(supplierRows);
        setLocations(locationRows);
        setLots(lotRows);
        setMovements(movementRows);
        setClinicalUsages(usageRows);
        setCounts(countRows);
        setCountLines(countLineRows);
      })
      .catch((loadError) => {
        console.error("Error cargando inventario profundo", loadError);
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [includeDeleted]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const activeItems = useMemo(() => items.filter((item) => !item.is_deleted), [items]);
  const openShifts = counts.filter((count) => !count.is_deleted && count.status === "abierto");
  const lowStock = activeItems.filter((item) => Number(item.current_stock) <= Number(item.minimum_stock));
  const outOfStock = activeItems.filter((item) => Number(item.current_stock) <= 0);
  const expiringLots = lots.filter((lot) => !lot.is_deleted && isExpiringSoon(lot.expiration_date, itemMap.get(lot.item_id)?.alert_days_before_expiration ?? 30));
  const expiredLots = lots.filter((lot) => !lot.is_deleted && lot.expiration_date && new Date(lot.expiration_date) < startOfToday());
  const inventoryValue = activeItems.reduce((sum, item) => sum + Number(item.current_stock ?? 0) * Number(item.reference_cost ?? 0), 0);
  const alertRows = [
    ...lowStock.map((item) => ({ title: item.name, detail: `Stock bajo: ${item.current_stock} / minimo ${item.minimum_stock}` })),
    ...expiredLots.map((lot) => ({ title: itemMap.get(lot.item_id)?.name ?? lot.lot_number, detail: `Lote vencido: ${lot.lot_number}` })),
    ...expiringLots.map((lot) => ({ title: itemMap.get(lot.item_id)?.name ?? lot.lot_number, detail: `Lote por vencer: ${lot.lot_number}` })),
    ...activeItems.filter((item) => item.reference_cost == null).map((item) => ({ title: item.name, detail: "Sin costo unitario configurado." })),
  ];

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return items;
    return items.filter((item) =>
      JSON.stringify([
        item.name,
        item.sku,
        item.barcode,
        item.category,
        categoryMap.get(item.category_id ?? "")?.name,
        unitMap.get(item.unit_id ?? "")?.name,
        unitMap.get(item.presentation_unit_id ?? "")?.name,
        supplierMap.get(item.supplier_id ?? "")?.name,
        locationMap.get(item.location_id ?? "")?.name,
      ])
        .toLowerCase()
        .includes(search)
    );
  }, [categoryMap, items, locationMap, query, supplierMap, unitMap]);

  const selectedHistoryItem = useMemo(() => {
    const search = normalizeSearchText(movementQuery);
    if (!search) return null;
    return activeItems.find((item) =>
      normalizeSearchText([
        item.name,
        item.sku,
        item.barcode,
        item.category,
        categoryMap.get(item.category_id ?? "")?.name,
        supplierMap.get(item.supplier_id ?? "")?.name,
        locationMap.get(item.location_id ?? "")?.name,
      ].join(" ")).includes(search)
    ) ?? null;
  }, [activeItems, categoryMap, locationMap, movementQuery, supplierMap]);

  const filteredMovements = useMemo(() => {
    const search = normalizeSearchText(movementQuery);
    if (!search) return movements;
    return movements.filter((movement) => {
      const usage = usageByMovement.get(movement.id);
      return normalizeSearchText([
        movement.item_name_snapshot,
        movement.movement_type,
        movement.quantity,
        movement.lot_number_snapshot,
        movement.supplier_name_snapshot,
        movement.from_location_snapshot,
        movement.to_location_snapshot,
        movement.reference,
        movement.reason,
        movement.created_by_profile?.full_name,
        movement.created_by_profile?.email,
        usage?.patients?.full_name,
        usage?.patients?.document_number,
        usage?.notes,
      ].join(" ")).includes(search);
    });
  }, [movementQuery, movements, usageByMovement]);

  const selectedItemMovements = useMemo(
    () => (selectedHistoryItem ? movements.filter((movement) => movement.item_id === selectedHistoryItem.id) : []),
    [movements, selectedHistoryItem]
  );
  const selectedItemUsages = useMemo(
    () => (selectedHistoryItem ? clinicalUsages.filter((usage) => usage.item_id === selectedHistoryItem.id) : []),
    [clinicalUsages, selectedHistoryItem]
  );
  const selectedItemCountLines = useMemo(
    () => (selectedHistoryItem ? countLines.filter((line) => line.item_id === selectedHistoryItem.id).slice().reverse() : []),
    [countLines, selectedHistoryItem]
  );
  const reportRange = useMemo(
    () => normalizeReportRange({ startDate: reportStartDate, endDate: reportEndDate }),
    [reportEndDate, reportStartDate]
  );
  const reportUsageRows = useMemo(
    () =>
      buildInventoryUsageReportRows({
        clinicalUsages,
        movements,
        itemMap,
        categoryMap,
        unitMap,
        usageMovementIds,
        range: reportRange,
      }),
    [categoryMap, clinicalUsages, itemMap, movements, reportRange, unitMap, usageMovementIds]
  );
  const reportUsageSummaryRows = useMemo(() => buildInventoryUsageSummaryRows(reportUsageRows), [reportUsageRows]);
  const reportCountRows = useMemo(
    () =>
      buildInventoryCountReportRows({
        counts,
        countLines,
        countMap,
        itemMap,
        unitMap,
        range: reportRange,
      }),
    [countLines, countMap, counts, itemMap, reportRange, unitMap]
  );
  const reportResponsibleRows = useMemo(
    () => buildInventoryResponsibleReportRows(reportUsageRows, reportCountRows),
    [reportCountRows, reportUsageRows]
  );
  const reportConsumptionRows = reportUsageRows.filter((row) => ["Uso paciente", "Uso interno", "Merma"].includes(row.reportType));
  const reportEntryRows = reportUsageRows.filter((row) => row.reportType === "Entrada");
  const reportCountDifferenceRows = reportCountRows.filter((row) => Number(row.differenceStock) !== 0);
  const reportEstimatedConsumptionCost = reportUsageSummaryRows.reduce((sum, row) => sum + row.estimatedCost, 0);

  const openModal = (nextModal: Exclude<ModalKey, null>, row?: unknown) => {
    setEditing(row ?? null);
    setSaveStatus(null);
    if (nextModal === "item") setItemForm(row ? itemToForm(row as InventoryItemRow) : emptyItemForm);
    if (nextModal === "category") setCategoryForm(row ? pickCategory(row as InventoryCategoryRow) : emptyCategoryForm);
    if (nextModal === "unit") setUnitForm(row ? pickUnit(row as InventoryUnitRow) : emptyUnitForm);
    if (nextModal === "supplier") setSupplierForm(row ? pickSupplier(row as InventorySupplierRow) : emptySupplierForm);
    if (nextModal === "location") setLocationForm(row ? pickLocation(row as InventoryLocationRow) : emptyLocationForm);
    if (nextModal === "lot") setLotForm(row ? lotToForm(row as InventoryLotRow) : emptyLotForm);
    if (nextModal === "movement") {
      setMovementForm({ ...emptyMovementForm, item_id: activeItems[0]?.id ?? "" });
      setMovementSearch("");
      setInternalUsageDrafts([]);
    }
    if (nextModal === "count") setCountForm({ ...emptyCountForm, item_id: activeItems[0]?.id ?? "", location_id: locations[0]?.id ?? "" });
    if (nextModal === "shift") setShiftForm({ ...emptyShiftForm, location_id: locations[0]?.id ?? "" });
    setModal(nextModal);
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
    setSaveStatus(null);
    setMovementSearch("");
    setInternalUsageDrafts([]);
  };

  const openMovementModal = (movementType: InventoryMovementRow["movement_type"] = "entrada", reason = "") => {
    openModal("movement");
    setMovementSearch("");
    setInternalUsageDrafts([]);
    setMovementForm((current) => ({ ...current, movement_type: movementType, reason }));
  };

  const applyReportPeriod = (period: ReportPeriod) => {
    setReportPeriod(period);
    if (period === "custom") return;
    const nextRange = getDefaultReportRange(period);
    setReportStartDate(nextRange.startDate);
    setReportEndDate(nextRange.endDate);
  };

  const submit = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      if (modal === "item") await saveItem();
      if (modal === "category") await saveSimple("inventory_categories", editing as InventoryCategoryRow | null, categoryForm, createInventoryCategory, updateInventoryCategory);
      if (modal === "unit") await saveSimple("inventory_units", editing as InventoryUnitRow | null, unitPayload(unitForm), createInventoryUnit, updateInventoryUnit);
      if (modal === "supplier") await saveSimple("inventory_suppliers", editing as InventorySupplierRow | null, supplierPayload(supplierForm), createInventorySupplier, updateInventorySupplier);
      if (modal === "location") await saveSimple("inventory_locations", editing as InventoryLocationRow | null, locationForm, createInventoryLocation, updateInventoryLocation);
      if (modal === "lot") await saveLot();
      if (modal === "movement") await saveMovement();
      if (modal === "count") await saveCount();
      if (modal === "shift") await saveShift();
      closeModal();
      load();
    } catch (submitError) {
      console.error("Error guardando inventario", submitError);
      setSaveStatus({ type: "error", text: getInventorySubmitErrorMessage(submitError) });
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async () => {
    const category = categoryMap.get(itemForm.category_id);
    const unit = unitMap.get(itemForm.unit_id);
    const presentationUnitId = normalizeText(itemForm.presentation_unit_id);
    const unitsPerPresentation = Math.max(Number(itemForm.units_per_presentation) || 1, 1);
    const usesPresentation = hasPresentationConfig(presentationUnitId, unitsPerPresentation);
    const current = editing as InventoryItemRow | null;
    const payload = {
      category: category?.name ?? "General",
      unit: unit?.abbreviation ?? "u",
      name: itemForm.name,
      item_type: itemForm.item_type,
      sku: normalizeText(itemForm.sku),
      barcode: normalizeText(itemForm.barcode),
      city: normalizeText(itemForm.city),
      category_id: normalizeText(itemForm.category_id),
      unit_id: normalizeText(itemForm.unit_id),
      presentation_unit_id: presentationUnitId,
      supplier_id: normalizeText(itemForm.supplier_id),
      location_id: normalizeText(itemForm.location_id),
      lot_number: normalizeText(itemForm.lot_number),
      expiration_date: normalizeText(itemForm.expiration_date),
      notes: normalizeText(itemForm.notes),
      current_stock: canManageInventoryCorrections
        ? usesPresentation
          ? toInternalQuantity(Number(itemForm.current_stock_presentations), unitsPerPresentation)
          : Number(itemForm.current_stock)
        : current
          ? Number(current.current_stock ?? 0)
          : 0,
      minimum_stock: usesPresentation
        ? toInternalQuantity(Number(itemForm.minimum_stock_presentations), unitsPerPresentation)
        : Number(itemForm.minimum_stock),
      units_per_presentation: unitsPerPresentation,
      reference_cost: itemForm.reference_cost > 0 ? Number(itemForm.reference_cost) : null,
      sale_price: itemForm.sale_price > 0 ? Number(itemForm.sale_price) : null,
      alert_days_before_expiration: Number(itemForm.alert_days_before_expiration),
      is_active: itemForm.is_active,
      updated_by: actorId,
    };
    if (current) await updateInventoryItem(current.id, payload);
    else await createInventoryItem({ ...payload, created_by: actorId });
  };

  const saveLot = async () => {
    const selectedItem = itemMap.get(lotForm.item_id);
    const presentationUnitId = normalizeText(lotForm.presentation_unit_id) ?? selectedItem?.presentation_unit_id ?? null;
    const unitsPerPresentation = Math.max(Number(lotForm.units_per_presentation) || Number(selectedItem?.units_per_presentation ?? 1), 1);
    const usesPresentation = hasPresentationConfig(presentationUnitId, unitsPerPresentation);
    const initialQuantity = usesPresentation
      ? toInternalQuantity(Number(lotForm.initial_quantity_presentations), unitsPerPresentation)
      : Number(lotForm.initial_quantity);
    const currentQuantity = usesPresentation
      ? toInternalQuantity(Number(lotForm.current_quantity_presentations), unitsPerPresentation)
      : Number(lotForm.current_quantity);

    if (!Number.isFinite(initialQuantity) || initialQuantity < 0 || !Number.isFinite(currentQuantity) || currentQuantity < 0) {
      throw new Error("Las cantidades del lote no pueden ser negativas.");
    }

    const basePayload = {
      item_id: lotForm.item_id || activeItems[0]?.id,
      lot_number: lotForm.lot_number,
      supplier_id: normalizeText(lotForm.supplier_id),
      location_id: normalizeText(lotForm.location_id),
      presentation_unit_id: presentationUnitId,
      received_date: normalizeText(lotForm.received_date),
      expiration_date: normalizeText(lotForm.expiration_date),
      initial_quantity: initialQuantity,
      current_quantity: currentQuantity,
      units_per_presentation: unitsPerPresentation,
      unit_cost: lotForm.unit_cost > 0 ? Number(lotForm.unit_cost) : null,
      notes: normalizeText(lotForm.notes),
      is_active: lotForm.is_active,
      updated_by: actorId,
    };
    const current = editing as InventoryLotRow | null;
    if (current) {
      if (current.item_id !== basePayload.item_id) {
        throw new Error("No se puede cambiar el item de un lote existente. Crea un lote nuevo para otro insumo.");
      }

      const previousCurrentQuantity = Number(current.current_quantity ?? 0);
      const delta = currentQuantity - previousCurrentQuantity;

      if (Math.abs(delta) > 0.0001) {
        await recordInventoryMovement({
          itemId: current.item_id,
          movementType: delta > 0 ? "entrada" : "salida",
          quantity: Math.abs(delta),
          lotId: current.id,
          unitCost: lotForm.unit_cost > 0 ? Number(lotForm.unit_cost) : null,
          toLocationId: delta > 0 ? basePayload.location_id : null,
          supplierId: delta > 0 ? basePayload.supplier_id : null,
          reference: `Lote ${lotForm.lot_number}`,
          reason: delta > 0 ? "Ajuste de lote: ingreso adicional" : "Ajuste de lote: descuento de cantidad disponible",
          movementDate: lotForm.received_date ? new Date(`${lotForm.received_date}T12:00:00`).toISOString() : null,
        });
      }

      await updateInventoryLot(current.id, {
        ...basePayload,
        current_quantity: currentQuantity,
      });
      return;
    }

    const createdLot = await createInventoryLot({
      ...basePayload,
      initial_quantity: 0,
      current_quantity: 0,
      created_by: actorId,
    });

    if (currentQuantity > 0) {
      await recordInventoryMovement({
        itemId: createdLot.item_id,
        movementType: "entrada",
        quantity: currentQuantity,
        lotId: createdLot.id,
        unitCost: lotForm.unit_cost > 0 ? Number(lotForm.unit_cost) : null,
        toLocationId: basePayload.location_id,
        supplierId: basePayload.supplier_id,
        reference: `Lote ${lotForm.lot_number}`,
        reason: "Ingreso inicial de lote",
        movementDate: lotForm.received_date ? new Date(`${lotForm.received_date}T12:00:00`).toISOString() : null,
      });
    }

    if (initialQuantity !== currentQuantity) {
      await updateInventoryLot(createdLot.id, {
        initial_quantity: initialQuantity,
        updated_by: actorId,
      });
    }
  };

  const saveMovement = async () => {
    if (movementForm.movement_type === "entrada") {
      validateInventoryEntryDrafts(internalUsageDrafts, itemMap, lots);
      const movementDate = movementForm.movement_date ? new Date(movementForm.movement_date).toISOString() : null;
      const reference = normalizeText(movementForm.reference) ?? `Entrada inventario ${getLocalDateValue()}`;
      const fallbackReason = normalizeText(movementForm.reason) ?? "Ingreso de inventario";

      for (const draft of internalUsageDrafts) {
        await recordInventoryMovement({
          itemId: draft.item_id,
          movementType: "entrada",
          quantity: Number(draft.quantity),
          lotId: normalizeText(draft.lot_id),
          unitCost: movementForm.unit_cost > 0 ? Number(movementForm.unit_cost) : null,
          toLocationId: normalizeText(movementForm.to_location_id),
          supplierId: normalizeText(movementForm.supplier_id),
          reference,
          reason: normalizeText(draft.reason) ?? fallbackReason,
          movementDate,
        });
      }
      return;
    }

    if (movementForm.movement_type === "salida") {
      validateInternalUsageDrafts(internalUsageDrafts, itemMap, lots);
      const movementDate = movementForm.movement_date ? new Date(movementForm.movement_date).toISOString() : null;
      const reference = normalizeText(movementForm.reference) ?? `Uso interno ${getLocalDateValue()}`;
      const fallbackReason = normalizeText(movementForm.reason) ?? "Uso interno sin paciente";

      for (const draft of internalUsageDrafts) {
        await recordInventoryMovement({
          itemId: draft.item_id,
          movementType: "salida",
          quantity: Number(draft.quantity),
          lotId: normalizeText(draft.lot_id),
          reference,
          reason: normalizeText(draft.reason) ?? fallbackReason,
          movementDate,
        });
      }
      return;
    }

    await recordInventoryMovement({
      itemId: movementForm.item_id,
      movementType: movementForm.movement_type,
      quantity: Number(movementForm.quantity),
      lotId: normalizeText(movementForm.lot_id),
      unitCost: movementForm.unit_cost > 0 ? Number(movementForm.unit_cost) : null,
      fromLocationId: normalizeText(movementForm.from_location_id),
      toLocationId: normalizeText(movementForm.to_location_id),
      supplierId: normalizeText(movementForm.supplier_id),
      reference: movementForm.reference,
      reason: movementForm.reason,
      movementDate: movementForm.movement_date ? new Date(movementForm.movement_date).toISOString() : null,
    });
  };

  const saveCount = async () => {
    await recordInventoryCountLine({
      itemId: countForm.item_id,
      countedStock: Number(countForm.counted_stock),
      locationId: normalizeText(countForm.location_id),
      notes: countForm.notes,
      countDate: countForm.count_date,
    });
  };

  const saveShift = async () => {
    await openInventoryShift({
      locationId: normalizeText(shiftForm.location_id),
      shiftName: normalizeText(shiftForm.shift_name),
      notes: normalizeText(shiftForm.notes),
      countDate: shiftForm.count_date,
    });
    setActiveTab("conteos");
  };

  const setShiftLineDraft = (lineId: string, draft: ShiftLineDraft) => {
    setShiftLineDrafts((current) => ({ ...current, [lineId]: draft }));
  };

  const getLineDraft = (line: InventoryCountLineRow) =>
    shiftLineDrafts[line.id] ?? { counted_stock: Number(line.counted_stock ?? 0), notes: line.notes ?? "" };

  const saveShiftLine = async (line: InventoryCountLineRow) => {
    setSaving(true);
    setShiftStatus(null);
    try {
      const draft = getLineDraft(line);
      await updateInventoryShiftLine({
        countId: line.count_id,
        itemId: line.item_id,
        countedStock: Number(draft.counted_stock),
        notes: normalizeText(draft.notes),
      });
      setShiftStatus({ type: "success", text: "Conteo guardado para este item." });
      load();
    } catch (lineError) {
      console.error("Error guardando linea de turno", lineError);
      setShiftStatus({ type: "error", text: getInventorySubmitErrorMessage(lineError) });
    } finally {
      setSaving(false);
    }
  };

  const syncShiftDrafts = async (countId: string) => {
    const lines = countLinesByCount.get(countId) ?? [];
    const activeLines = lines.filter((line) => {
      const item = itemMap.get(line.item_id);
      return item && !item.is_deleted;
    });
    await Promise.all(
      activeLines.map((line) => {
        const draft = getLineDraft(line);
        return updateInventoryShiftLine({
          countId,
          itemId: line.item_id,
          countedStock: Number(draft.counted_stock),
          notes: normalizeText(draft.notes),
        });
      })
    );
  };

  const closeShift = async (count: InventoryCountRow) => {
    const openerId = count.opened_by ?? count.created_by;
    if (!actorId) {
      setShiftStatus({ type: "error", text: "No pudimos identificar a la responsable conectada." });
      return;
    }

    if (openerId && openerId !== actorId && role !== "superadmin") {
      setShiftStatus({ type: "error", text: "Solo la responsable que abrio este turno o Superusuario puede cerrarlo." });
      return;
    }

    setSaving(true);
    setShiftStatus(null);
    try {
      await syncShiftDrafts(count.id);
      await closeInventoryShift({
        countId: count.id,
        notes: normalizeText(closingNotesByShift[count.id]),
      });
      setShiftStatus({ type: "success", text: "Turno cerrado y stock actualizado con las diferencias del conteo." });
      setShiftLineDrafts({});
      setClosingNotesByShift((current) => ({ ...current, [count.id]: "" }));
      load();
    } catch (closeError) {
      console.error("Error cerrando turno de inventario", closeError);
      setShiftStatus({ type: "error", text: getInventorySubmitErrorMessage(closeError) });
    } finally {
      setSaving(false);
    }
  };

  const reopenShift = async (count: InventoryCountRow) => {
    if (role !== "superadmin") {
      setShiftStatus({ type: "error", text: "Solo Superusuario puede reabrir turnos cerrados." });
      return;
    }

    setSaving(true);
    setShiftStatus(null);
    try {
      await reopenInventoryShift({
        countId: count.id,
        notes: "Reapertura para correccion de conteo",
      });
      setShiftStatus({ type: "success", text: "Turno reabierto. Puedes corregir el conteo y cerrarlo nuevamente." });
      load();
    } catch (reopenError) {
      console.error("Error reabriendo turno de inventario", reopenError);
      setShiftStatus({ type: "error", text: getInventorySubmitErrorMessage(reopenError) });
    } finally {
      setSaving(false);
    }
  };

  const saveSimple = async <T extends { id: string }>(
    _table: DeletableTable,
    current: T | null,
    payload: Record<string, unknown>,
    createFn: (data: Record<string, unknown>) => Promise<T>,
    updateFn: (id: string, data: Record<string, unknown>) => Promise<T>
  ) => {
    const data = { ...payload, updated_by: actorId };
    if (current) await updateFn(current.id, data);
    else await createFn({ ...data, created_by: actorId });
  };

  const archive = (table: DeletableTable, id: string) =>
    softDeleteRecord({ table, id, actorId, actorRole: role, actorName, actorEmail }).then(load);

  const exportReport = (kind: "items" | "lots" | "movements" | "counts" | "suppliers" | "usage" | "usageSummary" | "countPeople" | "responsibles") => {
    const today = new Date().toISOString().slice(0, 10);
    const rangeSlug = `${reportRange.startDate}_a_${reportRange.endDate}`;
    if (kind === "items") {
      downloadCsv(`inventario-items-${today}.csv`, filteredItems.map((item) => itemReport(item, categoryMap, unitMap, supplierMap, locationMap)));
    }
    if (kind === "lots") {
      downloadCsv(`inventario-lotes-${today}.csv`, lots.map((lot) => lotReport(lot, itemMap, supplierMap, locationMap, unitMap)));
    }
    if (kind === "movements") {
      downloadCsv(`inventario-kardex-${today}.csv`, movements.map((movement) => ({ ...movement })));
    }
    if (kind === "counts") {
      downloadCsv(`inventario-conteos-${today}.csv`, counts.map((count) => ({ ...count, lugar: locationMap.get(count.location_id ?? "")?.name ?? "" })));
    }
    if (kind === "suppliers") {
      downloadCsv(`inventario-proveedores-${today}.csv`, suppliers.map((supplier) => ({ ...supplier })));
    }
    if (kind === "usage") {
      downloadCsv(`inventario-consumo-detalle-${rangeSlug}.csv`, reportUsageRows.map(usageReportCsvRow));
    }
    if (kind === "usageSummary") {
      downloadCsv(`inventario-consumo-resumen-${rangeSlug}.csv`, reportUsageSummaryRows.map(usageSummaryCsvRow));
    }
    if (kind === "countPeople") {
      downloadCsv(`inventario-conteos-responsables-${rangeSlug}.csv`, reportCountRows.map(countReportCsvRow));
    }
    if (kind === "responsibles") {
      downloadCsv(`inventario-responsables-${rangeSlug}.csv`, reportResponsibleRows);
    }
  };

  if (loading) return <LoadingState label="Cargando inventario..." />;
  if (error) return <ErrorState label="No pudimos cargar el inventario completo." />;

  return (
    <div className="space-y-6">
      <section className="rounded-[32px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">Inventario global</p>
            <h1 className="font-display mt-2 text-4xl font-semibold md:text-5xl">Insumos, lotes, movimientos y reportes</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <CommandButton icon={<Plus className="h-4 w-4" />} label="Nuevo item" onClick={() => openModal("item")} primary />
            <CommandButton icon={<Warehouse className="h-4 w-4" />} label="Registrar entrada" onClick={() => openMovementModal("entrada")} />
            <CommandButton icon={<PackageMinus className="h-4 w-4" />} label="Uso interno" onClick={() => openMovementModal("salida", "Uso interno sin paciente")} />
            <CommandButton icon={<ClipboardCheck className="h-4 w-4" />} label="Abrir turno" onClick={() => openModal("shift")} />
            <CommandButton icon={<Archive className="h-4 w-4" />} label="Registrar merma" onClick={() => openMovementModal("merma")} />
            <CommandButton icon={<Download className="h-4 w-4" />} label="CSV" onClick={() => exportReport("items")} />
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto rounded-full bg-[rgba(216,194,174,0.22)] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-copy)] hover:bg-white/50"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "resumen" ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            <SummaryCard label="Total items" value={String(activeItems.length)} tone="green" />
            <SummaryCard label="Turnos abiertos" value={String(openShifts.length)} tone={openShifts.length > 0 ? "gold" : "green"} />
            <SummaryCard label="Stock bajo" value={String(lowStock.length)} tone="gold" />
            <SummaryCard label="Sin stock" value={String(outOfStock.length)} tone="red" />
            <SummaryCard label="Por vencer" value={String(expiringLots.length)} tone="gold" />
            <SummaryCard label="Vencidos" value={String(expiredLots.length)} tone="red" />
            <SummaryCard label="Valor estimado" value={formatMoney(inventoryValue)} tone="green" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel eyebrow="Operacion" title="Acciones rapidas">
              <div className="grid gap-3">
                <button onClick={() => openMovementModal("entrada")} className="rounded-full bg-[rgba(198,162,123,0.28)] px-5 py-3 text-sm font-bold text-[var(--color-ink)]">Registrar compra / entrada</button>
                <button onClick={() => openMovementModal("salida", "Uso interno sin paciente")} className="rounded-full bg-[rgba(154,107,67,0.14)] px-5 py-3 text-sm font-bold text-[var(--color-ink)]">Descontar uso interno</button>
                <button onClick={() => openMovementModal("merma")} className="rounded-full bg-[rgba(154,107,67,0.14)] px-5 py-3 text-sm font-bold text-[var(--color-ink)]">Registrar merma</button>
                <button onClick={() => openMovementModal("transferencia")} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-bold text-white">Transferir ubicación</button>
                <button onClick={() => openModal("shift")} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-bold text-white">Abrir turno de inventario</button>
                <button onClick={() => setActiveTab("pedidos")} className="rounded-full bg-[rgba(110,74,47,0.92)] px-5 py-3 text-sm font-bold text-white">Pedidos a proveedor</button>
              </div>
            </Panel>
            <Panel eyebrow="Alertas" title="Atencion requerida" action={<button onClick={() => setActiveTab("alertas")} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-bold text-white">Ver todas</button>}>
              <RowsEmpty rows={alertRows.slice(0, 5)} empty="Sin alertas activas." render={(row) => <AlertRow key={`${row.title}-${row.detail}`} title={row.title} detail={row.detail} />} />
            </Panel>
            <Panel eyebrow="Kardex" title="Movimientos recientes" action={<button onClick={() => setActiveTab("movimientos")} className="rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-bold text-white">Ver kardex</button>}>
              <RowsEmpty rows={movements.slice(0, 5)} empty="Sin movimientos recientes." render={(movement) => (
                <AlertRow key={movement.id} title={`${movement.item_name_snapshot} · ${movement.movement_type}`} detail={`${movement.quantity} · ${new Date(movement.movement_date).toLocaleString("es-BO")}`} />
              )} />
            </Panel>
          </div>
        </div>
      ) : null}

      {activeTab === "items" ? (
        <Panel eyebrow="Catalogo" title="Items e insumos" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Item" onClick={() => openModal("item")} primary />}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar item, SKU, proveedor o lugar" className="premium-input mb-4" />
          <RowsEmpty rows={filteredItems} empty="Sin items registrados." render={(item) => (
            <RowCard
              key={item.id}
              title={item.name}
              tags={[
                categoryMap.get(item.category_id ?? "")?.name ?? item.category,
                unitMap.get(item.unit_id ?? "")?.abbreviation ?? item.unit,
                unitMap.get(item.presentation_unit_id ?? "")?.abbreviation
                  ? `${unitMap.get(item.presentation_unit_id ?? "")?.abbreviation} x ${formatInventoryNumber(item.units_per_presentation)}`
                  : "",
                locationMap.get(item.location_id ?? "")?.name ?? "Sin lugar",
              ]}
              detail={`Stock ${formatStockSummary(item.current_stock, getUnitLabel(item.unit_id, item.unit, unitMap), item.presentation_unit_id, item.units_per_presentation, unitMap)} · minimo ${formatStockSummary(item.minimum_stock, getUnitLabel(item.unit_id, item.unit, unitMap), item.presentation_unit_id, item.units_per_presentation, unitMap)} · costo ${formatMoney(item.reference_cost)}`}
              deletedRow={item}
              actions={
                <>
                  <button
                    onClick={() => {
                      setActiveTab("movimientos");
                      setMovementQuery(item.name);
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
                  >
                    <Search className="h-4 w-4" />
                    Ver movimientos
                  </button>
                  <CrudActions role={role} row={item} table="inventory_items" onEdit={() => openModal("item", item)} onArchive={() => void archive("inventory_items", item.id)} onRestore={() => void restoreRecord("inventory_items", item.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_items", item.id).then(load)} />
                </>
              }
            />
          )} />
        </Panel>
      ) : null}

      {activeTab === "categorias" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel eyebrow="Categorias" title="Familias de inventario" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Categoria" onClick={() => openModal("category")} primary />}>
            <RowsEmpty rows={categories} empty="Sin categorias." render={(category) => (
              <RowCard key={category.id} title={category.name} detail={category.description ?? "Sin descripción"} deletedRow={category} actions={<CrudActions role={role} row={category} table="inventory_categories" onEdit={() => openModal("category", category)} onArchive={() => void archive("inventory_categories", category.id)} onRestore={() => void restoreRecord("inventory_categories", category.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_categories", category.id).then(load)} />} />
            )} />
          </Panel>
          <Panel eyebrow="Unidades" title="Medidas y empaques" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Unidad" onClick={() => openModal("unit")} primary />}>
            <RowsEmpty rows={units} empty="Sin unidades." render={(unit) => (
              <RowCard key={unit.id} title={unit.name} tags={[unit.abbreviation, unit.unit_type, unit.is_base_unit ? "Base" : `x ${unit.conversion_factor}`]} detail="Medida disponible para items e insumos." deletedRow={unit} actions={<CrudActions role={role} row={unit} table="inventory_units" onEdit={() => openModal("unit", unit)} onArchive={() => void archive("inventory_units", unit.id)} onRestore={() => void restoreRecord("inventory_units", unit.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_units", unit.id).then(load)} />} />
            )} />
          </Panel>
        </div>
      ) : null}

      {activeTab === "lotes" ? (
        <Panel eyebrow="Trazabilidad" title="Lotes y vencimientos" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Lote" onClick={() => openModal("lot")} primary />}>
          <RowsEmpty rows={lots} empty="Sin lotes." render={(lot) => (
            <RowCard
              key={lot.id}
              title={`${itemMap.get(lot.item_id)?.name ?? "Item"} · ${lot.lot_number}`}
              tags={[
                locationMap.get(lot.location_id ?? "")?.name ?? "Sin lugar",
                supplierMap.get(lot.supplier_id ?? "")?.name ?? "Sin proveedor",
                unitMap.get(lot.presentation_unit_id ?? itemMap.get(lot.item_id)?.presentation_unit_id ?? "")?.abbreviation
                  ? `${unitMap.get(lot.presentation_unit_id ?? itemMap.get(lot.item_id)?.presentation_unit_id ?? "")?.abbreviation} x ${formatInventoryNumber(lot.units_per_presentation ?? itemMap.get(lot.item_id)?.units_per_presentation ?? 1)}`
                  : "",
              ]}
              detail={`Cantidad ${formatStockSummary(lot.current_quantity, getUnitLabel(itemMap.get(lot.item_id)?.unit_id ?? null, itemMap.get(lot.item_id)?.unit ?? "u", unitMap), lot.presentation_unit_id ?? itemMap.get(lot.item_id)?.presentation_unit_id ?? null, lot.units_per_presentation ?? itemMap.get(lot.item_id)?.units_per_presentation ?? 1, unitMap)} / ${formatStockSummary(lot.initial_quantity, getUnitLabel(itemMap.get(lot.item_id)?.unit_id ?? null, itemMap.get(lot.item_id)?.unit ?? "u", unitMap), lot.presentation_unit_id ?? itemMap.get(lot.item_id)?.presentation_unit_id ?? null, lot.units_per_presentation ?? itemMap.get(lot.item_id)?.units_per_presentation ?? 1, unitMap)} · vence ${formatDate(lot.expiration_date) || "sin fecha"} · costo ${formatMoney(lot.unit_cost)}`}
              deletedRow={lot}
              actions={<CrudActions role={role} row={lot} table="inventory_lots" onEdit={() => openModal("lot", lot)} onArchive={() => void archive("inventory_lots", lot.id)} onRestore={() => void restoreRecord("inventory_lots", lot.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_lots", lot.id).then(load)} />}
            />
          )} />
        </Panel>
      ) : null}

      {activeTab === "movimientos" ? (
        <Panel eyebrow="Kardex" title="Entradas, usos internos, mermas y transferencias" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Movimiento" onClick={() => openMovementModal("entrada")} primary />}>
          <label className="mb-4 flex items-center gap-3 rounded-[18px] border border-[var(--color-border)] bg-white/80 px-4 py-3">
            <Search className="h-4 w-4 text-[var(--color-copy)]" />
            <input
              value={movementQuery}
              onChange={(event) => setMovementQuery(event.target.value)}
              placeholder="Buscar insumo, paciente, usuario, lote o motivo"
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          {selectedHistoryItem ? (
            <InventoryItemTracePanel
              item={selectedHistoryItem}
              unitLabel={getUnitLabel(selectedHistoryItem.unit_id, selectedHistoryItem.unit, unitMap)}
              locationName={locationMap.get(selectedHistoryItem.location_id ?? "")?.name ?? "Sin ubicacion"}
              lots={lots.filter((lot) => lot.item_id === selectedHistoryItem.id && !lot.is_deleted)}
              movements={selectedItemMovements}
              usages={selectedItemUsages}
              countLines={selectedItemCountLines}
              countMap={countMap}
              usageByMovement={usageByMovement}
              usageMovementIds={usageMovementIds}
              unitMap={unitMap}
              canEditItem={canManageInventoryCorrections}
              onEditItem={() => openModal("item", selectedHistoryItem)}
              onRegisterEntry={() => openMovementModal("entrada")}
              onRegisterExit={() => openMovementModal("salida", "Uso interno sin paciente")}
              renderMovementActions={(movement) => (
                <CrudActions
                  role={role}
                  row={movement}
                  table="inventory_movements"
                  allowStaffSoftDelete
                  onArchive={() => void archive("inventory_movements", movement.id)}
                  onRestore={() => void restoreRecord("inventory_movements", movement.id).then(load)}
                  onHardDelete={() => void hardDeleteRecord("inventory_movements", movement.id).then(load)}
                />
              )}
            />
          ) : null}
          <RowsEmpty rows={filteredMovements} empty="Sin movimientos con esa busqueda." render={(movement) => (
            <RowCard key={movement.id} title={`${movement.item_name_snapshot} · ${movement.movement_type}`} tags={[movement.lot_number_snapshot ?? "Sin lote", movement.supplier_name_snapshot ?? "Sin proveedor"]} detail={`${movement.quantity} · ${movement.reason ?? "Sin motivo"} · ${new Date(movement.movement_date).toLocaleString("es-BO")}`} deletedRow={movement} actions={<CrudActions role={role} row={movement} table="inventory_movements" allowStaffSoftDelete onEdit={undefined} onArchive={() => void archive("inventory_movements", movement.id)} onRestore={() => void restoreRecord("inventory_movements", movement.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_movements", movement.id).then(load)} />} />
          )} />
        </Panel>
      ) : null}

      {activeTab === "conteos" ? (
        <Panel eyebrow="Turnos" title="Apertura, conteo de cierre y diferencias" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Abrir turno" onClick={() => openModal("shift")} primary />}>
          <div className="mb-5 rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.72)] px-4 py-3 text-sm leading-7 text-[var(--color-copy)]">
            Al abrir un turno se guarda lo que el equipo deja en inventario. Al cerrar, registra el conteo físico; el sistema calcula diferencias y actualiza stock solo cuando cierras el turno.
          </div>
          {shiftStatus ? (
            <div className={`mb-4 rounded-[20px] border px-4 py-3 text-sm font-semibold ${shiftStatus.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {shiftStatus.text}
            </div>
          ) : null}
          <RowsEmpty rows={counts} empty="Sin turnos de inventario." render={(count) => (
            <InventoryShiftCard
              key={count.id}
              count={count}
              lines={countLinesByCount.get(count.id) ?? []}
              itemMap={itemMap}
              unitMap={unitMap}
              locationName={locationMap.get(count.location_id ?? "")?.name ?? "Sin ubicación"}
              role={role}
              actorId={actorId}
              saving={saving}
              closingNotes={closingNotesByShift[count.id] ?? ""}
              getLineDraft={getLineDraft}
              onDraftChange={setShiftLineDraft}
              onSaveLine={saveShiftLine}
              onClosingNotesChange={(value) => setClosingNotesByShift((current) => ({ ...current, [count.id]: value }))}
              onCloseShift={() => void closeShift(count)}
              onReopenShift={() => void reopenShift(count)}
              onArchive={() => void archive("inventory_counts", count.id)}
              onRestore={() => void restoreRecord("inventory_counts", count.id).then(load)}
              onHardDelete={() => void hardDeleteRecord("inventory_counts", count.id).then(load)}
            />
          )} />
        </Panel>
      ) : null}

      {activeTab === "alertas" ? (
        <Panel eyebrow="Alertas" title="Riesgos de stock y vencimiento">
          <RowsEmpty rows={alertRows} empty="Sin alertas activas." render={(row) => <AlertRow key={`${row.title}-${row.detail}`} title={row.title} detail={row.detail} />} />
        </Panel>
      ) : null}

      {activeTab === "reportes" ? (
        <Panel eyebrow="Reportes" title="Consumo, conteos y responsables">
          <div className="grid gap-4 rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.72)] p-4 xl:grid-cols-[1fr_auto]">
            <div className="flex flex-wrap gap-2">
              {(["day", "week", "month", "custom"] as ReportPeriod[]).map((period) => (
                <ReportPeriodButton key={period} period={period} active={reportPeriod === period} onClick={() => applyReportPeriod(period)} />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">
                Desde
                <input
                  type="date"
                  value={reportRange.startDate}
                  onChange={(event) => {
                    setReportPeriod("custom");
                    setReportStartDate(event.target.value);
                  }}
                  className="premium-input"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Hasta
                <input
                  type="date"
                  value={reportRange.endDate}
                  onChange={(event) => {
                    setReportPeriod("custom");
                    setReportEndDate(event.target.value);
                  }}
                  className="premium-input"
                />
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricBox label="Consumos" value={String(reportConsumptionRows.length)} />
            <MetricBox label="Entradas" value={String(reportEntryRows.length)} />
            <MetricBox label="Conteos" value={String(reportCountRows.length)} />
            <MetricBox label="Diferencias" value={String(reportCountDifferenceRows.length)} />
            <MetricBox label="Valor consumido" value={formatMoney(reportEstimatedConsumptionCost)} />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section className="rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4">
              <h3 className="text-lg font-semibold text-[var(--color-ink)]">Consumo por insumo</h3>
              <div className="mt-4 grid gap-3">
                <RowsEmpty rows={reportUsageSummaryRows.slice(0, 8)} empty="Sin consumos en este periodo." render={(row) => (
                  <ReportSummaryRow key={row.key} row={row} />
                )} />
              </div>
            </section>

            <section className="rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4">
              <h3 className="text-lg font-semibold text-[var(--color-ink)]">Responsables del periodo</h3>
              <div className="mt-4 grid gap-3">
                <RowsEmpty rows={reportResponsibleRows.slice(0, 8)} empty="Sin responsables en este periodo." render={(row) => (
                  <ReportResponsibleRow key={row.responsable} row={row} />
                )} />
              </div>
            </section>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <section className="rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4">
              <h3 className="text-lg font-semibold text-[var(--color-ink)]">Detalle de consumo</h3>
              <div className="mt-4 grid gap-3">
                <RowsEmpty rows={reportUsageRows.slice(0, 10)} empty="Sin movimientos en este periodo." render={(row) => (
                  <ReportUsageRow key={row.id} row={row} />
                )} />
              </div>
            </section>

            <section className="rounded-[22px] border border-[rgba(198,162,123,0.18)] bg-white/70 p-4">
              <h3 className="text-lg font-semibold text-[var(--color-ink)]">Personas que hicieron conteos</h3>
              <div className="mt-4 grid gap-3">
                <RowsEmpty rows={reportCountRows.slice(0, 10)} empty="Sin conteos en este periodo." render={(row) => (
                  <ReportCountRow key={row.id} row={row} />
                )} />
              </div>
            </section>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ReportButton label="Consumo detalle" onClick={() => exportReport("usage")} />
            <ReportButton label="Consumo resumen" onClick={() => exportReport("usageSummary")} />
            <ReportButton label="Conteos responsables" onClick={() => exportReport("countPeople")} />
            <ReportButton label="Responsables periodo" onClick={() => exportReport("responsibles")} />
            <ReportButton label="Items" onClick={() => exportReport("items")} />
            <ReportButton label="Lotes" onClick={() => exportReport("lots")} />
            <ReportButton label="Kardex completo" onClick={() => exportReport("movements")} />
            <ReportButton label="Proveedores" onClick={() => exportReport("suppliers")} />
          </div>
        </Panel>
      ) : null}

      {activeTab === "proveedores" ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <Panel eyebrow="Proveedores" title="Contactos de compra" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Proveedor" onClick={() => openModal("supplier")} primary />}>
            <RowsEmpty rows={suppliers} empty="Sin proveedores." render={(supplier) => (
              <RowCard key={supplier.id} title={supplier.name} tags={[supplier.contact_name ?? "Sin contacto", supplier.phone ?? "Sin teléfono", supplier.whatsapp_phone ?? "Sin WhatsApp"]} detail={`${supplier.email ?? "Sin email"} · plazo ${supplier.payment_terms_days ?? 0} días · ${supplier.allows_consignment ? "Con consignación" : "Compra directa"} · ${supplier.notes ?? "Sin notas"}`} deletedRow={supplier} actions={<CrudActions role={role} row={supplier} table="inventory_suppliers" onEdit={() => openModal("supplier", supplier)} onArchive={() => void archive("inventory_suppliers", supplier.id)} onRestore={() => void restoreRecord("inventory_suppliers", supplier.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_suppliers", supplier.id).then(load)} />} />
            )} />
          </Panel>
          <Panel eyebrow="Ubicaciones" title="Almacenes y zonas" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Ubicacion" onClick={() => openModal("location")} primary />}>
            <RowsEmpty rows={locations} empty="Sin ubicaciones." render={(location) => (
              <RowCard key={location.id} title={location.name} tags={[location.city ?? "Sin ciudad"]} detail={location.description ?? "Sin descripción"} deletedRow={location} actions={<CrudActions role={role} row={location} table="inventory_locations" onEdit={() => openModal("location", location)} onArchive={() => void archive("inventory_locations", location.id)} onRestore={() => void restoreRecord("inventory_locations", location.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_locations", location.id).then(load)} />} />
            )} />
          </Panel>
          <Panel eyebrow="Unidades" title="Medidas y empaques" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Unidad" onClick={() => openModal("unit")} primary />}>
            <RowsEmpty rows={units} empty="Sin unidades." render={(unit) => (
              <RowCard key={unit.id} title={unit.name} tags={[unit.abbreviation, unit.unit_type]} detail={unit.is_base_unit ? "Unidad base" : `Equivale a ${unit.conversion_factor}`} deletedRow={unit} actions={<CrudActions role={role} row={unit} table="inventory_units" onEdit={() => openModal("unit", unit)} onArchive={() => void archive("inventory_units", unit.id)} onRestore={() => void restoreRecord("inventory_units", unit.id).then(load)} onHardDelete={() => void hardDeleteRecord("inventory_units", unit.id).then(load)} />} />
            )} />
          </Panel>
        </div>
      ) : null}

      {activeTab === "pedidos" ? (
        <InventorySupplierOrdersPanel
          role={role}
          actorId={actorId}
          actorName={actorName}
          actorEmail={actorEmail}
          includeDeleted={includeDeleted}
          suppliers={suppliers}
          items={items}
          locations={locations}
          onInventoryRefresh={load}
        />
      ) : null}

      {modal ? (
        <ModalShell title={modalTitle(modal, Boolean(editing))} onClose={closeModal}>
          {renderModalFields({
            modal,
            itemForm,
            setItemForm,
            categoryForm,
            setCategoryForm,
            unitForm,
            setUnitForm,
            supplierForm,
            setSupplierForm,
            locationForm,
            setLocationForm,
            lotForm,
            setLotForm,
            movementForm,
            setMovementForm,
            movementSearch,
            setMovementSearch,
            internalUsageDrafts,
            setInternalUsageDrafts,
            countForm,
            setCountForm,
            shiftForm,
            setShiftForm,
            items: activeItems,
            categories,
            units,
            suppliers,
            locations,
            lots,
            itemMap,
            canManageInventoryCorrections,
          })}
          {saveStatus ? (
            <div className="mt-6 rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
              {saveStatus.text}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={() => void submit()} disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button onClick={closeModal} className="rounded-full border border-[var(--color-border)] px-6 py-3 text-sm font-semibold">Cancelar</button>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

function CommandButton({ icon, label, onClick, primary = false }: { icon: ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold ${primary ? "bg-[rgba(198,162,123,0.28)] text-[var(--color-ink)]" : "bg-[var(--color-mocha)] text-white"}`}>
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "green" | "gold" | "red" }) {
  const classes =
    tone === "green"
      ? "bg-[linear-gradient(135deg,rgba(110,74,47,0.96),rgba(62,42,31,0.94))]"
      : tone === "gold"
        ? "bg-[linear-gradient(135deg,rgba(184,138,90,0.96),rgba(154,107,67,0.94))]"
        : "bg-[linear-gradient(135deg,rgba(122,83,58,0.96),rgba(94,61,40,0.94))]";
  return (
    <div className={`rounded-[26px] p-5 text-white ${classes}`}>
      <p className="text-sm font-bold opacity-90">{label}</p>
      <p className="mt-4 text-4xl font-extrabold">{value}</p>
    </div>
  );
}

function Panel({ eyebrow, title, action, children }: { eyebrow: string; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-[var(--color-border)] bg-white/75 p-5 shadow-[0_18px_50px_rgba(62,42,31,0.08)]">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--color-accent-strong)]">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RowCard({
  title,
  tags = [],
  detail,
  deletedRow,
  actions,
}: {
  title: string;
  tags?: string[];
  detail: string;
  deletedRow?: DeletionMetadata;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-[rgba(198,162,123,0.16)] bg-[rgba(247,242,236,0.74)] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap gap-2">
            {tags.filter(Boolean).map((tag) => (
              <span key={tag} className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{tag}</span>
            ))}
          </div>
          <h3 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">{detail}</p>
          <DeletedStatusNote row={deletedRow} />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">{actions}</div>
      </div>
    </div>
  );
}

function InventoryShiftCard({
  count,
  lines,
  itemMap,
  unitMap,
  locationName,
  role,
  actorId,
  saving,
  closingNotes,
  getLineDraft,
  onDraftChange,
  onSaveLine,
  onClosingNotesChange,
  onCloseShift,
  onReopenShift,
  onArchive,
  onRestore,
  onHardDelete,
}: {
  count: InventoryCountRow;
  lines: InventoryCountLineRow[];
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
  locationName: string;
  role: ReturnType<typeof useAuth>["role"];
  actorId: string | null;
  saving: boolean;
  closingNotes: string;
  getLineDraft: (line: InventoryCountLineRow) => ShiftLineDraft;
  onDraftChange: (lineId: string, draft: ShiftLineDraft) => void;
  onSaveLine: (line: InventoryCountLineRow) => void;
  onClosingNotesChange: (value: string) => void;
  onCloseShift: () => void;
  onReopenShift: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onHardDelete?: () => void;
}) {
  const isOpen = count.status === "abierto";
  const openerId = count.opened_by ?? count.created_by;
  const canClose = isOpen && Boolean(actorId) && (!openerId || openerId === actorId || role === "superadmin");
  const totalDifference = lines.reduce((sum, line) => {
    const draft = getLineDraft(line);
    return sum + (Number(draft.counted_stock ?? 0) - Number(line.expected_stock ?? 0));
  }, 0);
  const changedLines = lines.filter((line) => {
    const draft = getLineDraft(line);
    return Number(draft.counted_stock ?? 0) !== Number(line.expected_stock ?? 0);
  });
  const countLineActors = formatCountLineActors(lines);

  return (
    <div className="rounded-[24px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.74)] p-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${isOpen ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
              {isOpen ? "Turno abierto" : "Turno cerrado"}
            </span>
            <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{locationName}</span>
            <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{formatDate(count.count_date)}</span>
          </div>
          <h3 className="mt-3 text-xl font-semibold text-[var(--color-ink)]">{count.shift_name || "Turno de inventario"}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--color-copy)]">
              {formatInventoryShiftAudit(count)} - Items: {lines.length} - Diferencia: {formatInventoryNumber(totalDifference)}
            </p>
          <p className="mt-1 text-sm leading-6 text-[var(--color-copy)]">{count.notes ?? "Sin notas de apertura."}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--color-copy)]">Conteos: {countLineActors}</p>
          <DeletedStatusNote row={count} />
        </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            {isOpen ? (
              <button
                onClick={onCloseShift}
                disabled={saving || !canClose}
                className="rounded-full bg-[var(--color-mocha)] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                title={canClose ? "Cerrar este turno" : "Solo puede cerrar la responsable que abrio el turno o Superusuario"}
              >
                {saving ? "Cerrando..." : canClose ? "Cerrar turno" : "Solo responsable o Superusuario"}
              </button>
            ) : null}
            {!isOpen && role === "superadmin" ? (
              <button
                onClick={onReopenShift}
                disabled={saving}
                className="rounded-full border border-[var(--color-border)] bg-white px-5 py-2 text-sm font-semibold text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60"
                title="Reabrir este turno para corregir conteo"
              >
                {saving ? "Reabriendo..." : "Reabrir turno"}
              </button>
            ) : null}
          {role === "superadmin" || role === "admin" ? (
            <DeleteActions role={role} row={count} compact onSoftDelete={onArchive} onRestore={onRestore} onHardDelete={onHardDelete} />
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <div className="mt-5 grid gap-3">
          <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr_1fr_auto]">
            {lines.map((line) => {
              const item = itemMap.get(line.item_id);
              const draft = getLineDraft(line);
              const unitLabel = getUnitLabel(item?.unit_id ?? null, item?.unit ?? "u", unitMap);
              const expectedStock = Number(line.expected_stock ?? 0);
              const countedStock = Number(draft.counted_stock ?? 0);
              const difference = countedStock - expectedStock;

              return (
                <div key={line.id} className="contents">
                  <div className="rounded-2xl bg-white/72 px-4 py-3">
                    <p className="text-sm font-semibold">{item?.name ?? "Item"}</p>
                    <p className="mt-1 text-xs text-[var(--color-copy)]">Unidad: {unitLabel}</p>
                    <p className="mt-1 text-xs text-[var(--color-copy)]">Contado por: {formatActorLabel(line.counted_by_profile, line.counted_by)}</p>
                  </div>
                  <MetricBox label="Dejado" value={`${formatInventoryNumber(line.opening_stock)} ${unitLabel}`} />
                  <MetricBox label="Esperado" value={`${formatInventoryNumber(line.expected_stock)} ${unitLabel}`} />
                  <label className="rounded-2xl bg-white/72 px-4 py-3">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-copy)]">Contado</span>
                    <input
                      type="number"
                      step="0.01"
                      value={String(draft.counted_stock)}
                      onChange={(event) => onDraftChange(line.id, { ...draft, counted_stock: Number(event.target.value) })}
                      className="premium-input mt-2"
                    />
                  </label>
                  <label className="rounded-2xl bg-white/72 px-4 py-3">
                    <span className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-copy)]">Nota</span>
                    <input value={draft.notes} onChange={(event) => onDraftChange(line.id, { ...draft, notes: event.target.value })} className="premium-input mt-2" />
                  </label>
                  <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/72 px-4 py-3">
                    <span className={`text-sm font-bold ${difference === 0 ? "text-emerald-700" : "text-amber-800"}`}>
                      {formatInventoryNumber(difference)}
                    </span>
                    <button onClick={() => onSaveLine(line)} disabled={saving} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-bold disabled:opacity-60">
                      Guardar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <label className="grid gap-2">
            <span className="text-sm font-semibold">Notas de cierre</span>
            <textarea value={closingNotes} onChange={(event) => onClosingNotesChange(event.target.value)} className="premium-input min-h-24" />
          </label>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(changedLines.length > 0 ? changedLines : lines.slice(0, 6)).map((line) => {
            const item = itemMap.get(line.item_id);
            const unitLabel = getUnitLabel(item?.unit_id ?? null, item?.unit ?? "u", unitMap);
            return (
              <MetricBox
                key={line.id}
                label={item?.name ?? "Item"}
                value={`${formatInventoryNumber(line.counted_stock)} ${unitLabel} - dif. ${formatInventoryNumber(line.difference_stock)} - ${formatActorLabel(line.counted_by_profile, line.counted_by)}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/72 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-copy)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--color-ink)]">{value}</p>
    </div>
  );
}

function CrudActions({
  role,
  row,
  table,
  allowStaffSoftDelete = false,
  onEdit,
  onArchive,
  onRestore,
  onHardDelete,
}: {
  role: ReturnType<typeof useAuth>["role"];
  row: DeletionMetadata;
  table: DeletableTable;
  allowStaffSoftDelete?: boolean;
  onEdit?: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onHardDelete?: () => void;
}) {
  const canUseDeleteActions = role === "superadmin" || role === "admin" || (allowStaffSoftDelete && canSoftDelete(role));

  return (
    <>
      {onEdit ? (
        <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
          <Pencil className="h-4 w-4" />
          Editar
        </button>
      ) : null}
      {canUseDeleteActions ? (
        <DeleteActions role={role} row={row} compact onSoftDelete={onArchive} onRestore={onRestore} onHardDelete={onHardDelete} />
      ) : null}
      <span className="sr-only">{table}</span>
    </>
  );
}

function AlertRow({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[18px] bg-[rgba(247,242,236,0.74)] px-4 py-3">
      <p className="font-semibold text-[var(--color-ink)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--color-copy)]">{detail}</p>
    </div>
  );
}

function RowsEmpty<T>({ rows, empty, render }: { rows: T[]; empty: string; render: (row: T) => ReactNode }) {
  if (rows.length === 0) return <EmptyState label={empty} />;
  return <div className="grid gap-3">{rows.map(render)}</div>;
}

function InventoryItemTracePanel({
  item,
  unitLabel,
  locationName,
  lots,
  movements,
  usages,
  countLines,
  countMap,
  usageByMovement,
  usageMovementIds,
  unitMap,
  canEditItem,
  onEditItem,
  onRegisterEntry,
  onRegisterExit,
  renderMovementActions,
}: {
  item: InventoryItemRow;
  unitLabel: string;
  locationName: string;
  lots: InventoryLotRow[];
  movements: InventoryMovementRow[];
  usages: InventoryClinicalUsageRow[];
  countLines: InventoryCountLineRow[];
  countMap: Map<string, InventoryCountRow>;
  usageByMovement: Map<string, InventoryClinicalUsageRow>;
  usageMovementIds: Set<string>;
  unitMap: Map<string, InventoryUnitRow>;
  canEditItem: boolean;
  onEditItem: () => void;
  onRegisterEntry: () => void;
  onRegisterExit: () => void;
  renderMovementActions?: (movement: InventoryMovementRow) => ReactNode;
}) {
  const currentStock = Number(item.current_stock ?? 0);
  const lotStock = lots.reduce((sum, lot) => sum + Number(lot.current_quantity ?? 0), 0);
  const stockWithoutLot = currentStock - lotStock;
  const patientUsageTotal = usages.reduce((sum, usage) => sum + Number(usage.quantity ?? 0), 0);
  const manualDiscountTotal = movements
    .filter((movement) => ["salida", "merma"].includes(movement.movement_type) && !usageMovementIds.has(movement.id))
    .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
  const entryTotal = movements
    .filter((movement) => movement.movement_type === "entrada")
    .reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
  const countDifferenceTotal = countLines.reduce((sum, line) => sum + Number(line.difference_stock ?? 0), 0);

  return (
    <section className="mb-5 rounded-[24px] border border-[rgba(198,162,123,0.2)] bg-[rgba(247,242,236,0.74)] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-accent-strong)]">Historial del insumo</p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{item.name}</h3>
          <p className="mt-1 text-sm leading-6 text-[var(--color-copy)]">
            {locationName} - {item.sku ? `SKU ${item.sku}` : "Sin SKU"} - {item.lot_number ? `Lote actual ${item.lot_number}` : "Sin lote principal"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {canEditItem ? (
              <button onClick={onEditItem} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-2 text-sm font-semibold">
                <Pencil className="h-4 w-4" />
                Editar item
              </button>
            ) : null}
            <button onClick={onRegisterEntry} className="inline-flex items-center gap-2 rounded-full bg-[rgba(198,162,123,0.28)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]">
              <Plus className="h-4 w-4" />
              Registrar entrada
            </button>
            <button onClick={onRegisterExit} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/70 px-4 py-2 text-sm font-semibold">
              <PackageMinus className="h-4 w-4" />
              Registrar salida
            </button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
          <MetricBox label="Stock actual" value={formatStockSummary(currentStock, unitLabel, item.presentation_unit_id, Number(item.units_per_presentation ?? 1), unitMap)} />
          <MetricBox label="Stock minimo" value={formatStockSummary(Number(item.minimum_stock ?? 0), unitLabel, item.presentation_unit_id, Number(item.units_per_presentation ?? 1), unitMap)} />
          <MetricBox label="Lotes disponibles" value={`${formatInventoryNumber(lotStock)} ${unitLabel}`} />
          <MetricBox label="Ajustes por conteo" value={`${formatInventoryNumber(countDifferenceTotal)} ${unitLabel}`} />
        </div>
      </div>
      {Math.abs(stockWithoutLot) > 0.0001 ? (
        <p className="mt-3 rounded-[18px] border border-[var(--color-border)] bg-white/70 px-4 py-3 text-xs leading-6 text-[var(--color-copy)]">
          Stock general sin lote activo: {formatInventoryNumber(stockWithoutLot)} {unitLabel}. Para trazabilidad, las nuevas entradas deben ir ligadas a lote cuando aplique.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetricBox label="Ingresos registrados" value={`${formatInventoryNumber(entryTotal)} ${unitLabel}`} />
        <MetricBox label="Uso en pacientes" value={`${formatInventoryNumber(patientUsageTotal)} ${unitLabel}`} />
        <MetricBox label="Salidas y mermas manuales" value={`${formatInventoryNumber(manualDiscountTotal)} ${unitLabel}`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <TraceColumn title="Movimientos recientes" empty="Sin movimientos para este insumo.">
          {movements.slice(0, 6).map((movement) => {
            const usage = usageByMovement.get(movement.id);
            return (
              <TraceRow
                key={movement.id}
                title={`${movementTypeLabel(movement.movement_type)} - ${formatInventoryNumber(movement.quantity)} ${unitLabel}`}
                detail={[
                  formatDateTime(movement.movement_date),
                  formatActorLabel(movement.created_by_profile, movement.created_by),
                  usage?.patients?.full_name ? `Paciente: ${usage.patients.full_name}` : movement.reason,
                ].filter(Boolean).join(" - ")}
                actions={renderMovementActions?.(movement)}
              />
            );
          })}
        </TraceColumn>

        <TraceColumn title="Uso en pacientes" empty="Sin usos clinicos para este insumo.">
          {usages.slice(0, 6).map((usage) => (
            <TraceRow
              key={usage.id}
              title={`${usage.patients?.full_name ?? "Paciente"} - ${formatInventoryNumber(usage.quantity)} ${usage.unit_label ?? unitLabel}`}
              detail={[
                formatDateTime(usage.created_at),
                formatActorLabel(usage.created_by_profile, usage.created_by),
                usage.inventory_lots?.lot_number ? `Lote ${usage.inventory_lots.lot_number}` : null,
                usage.notes,
              ].filter(Boolean).join(" - ")}
              href={`/panel/pacientes/${usage.patient_id}/historia-clinica`}
            />
          ))}
        </TraceColumn>

        <TraceColumn title="Conteos y turnos" empty="Sin conteos para este insumo.">
          {countLines.slice(0, 6).map((line) => {
            const count = countMap.get(line.count_id);
            return (
              <TraceRow
                key={line.id}
                title={`${count?.shift_name || "Turno"} - dif. ${formatInventoryNumber(line.difference_stock)} ${unitLabel}`}
                detail={[
                  count ? formatDate(count.count_date) : null,
                  `Esperado ${formatInventoryNumber(line.expected_stock)} / contado ${formatInventoryNumber(line.counted_stock)}`,
                  `Dejado al abrir ${formatInventoryNumber(line.opening_stock)}`,
                  `Contado por ${formatActorLabel(line.counted_by_profile, line.counted_by)}`,
                  count ? formatInventoryShiftAudit(count) : null,
                ].filter(Boolean).join(" - ")}
              />
            );
          })}
        </TraceColumn>
      </div>
    </section>
  );
}

function TraceColumn({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <h4 className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--color-copy)]">{title}</h4>
      <div className="mt-3 grid gap-2">
        {hasRows ? children : <p className="rounded-[18px] bg-white/72 px-4 py-3 text-sm text-[var(--color-copy)]">{empty}</p>}
      </div>
    </div>
  );
}

function TraceRow({ title, detail, href, actions }: { title: string; detail: string; href?: string; actions?: ReactNode }) {
  const content = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-[var(--color-ink)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--color-copy)]">{detail}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </>
  );

  if (href) {
    return (
      <a href={href} className="block rounded-[18px] bg-white/72 px-4 py-3 transition hover:bg-white">
        {content}
      </a>
    );
  }

  return <div className="rounded-[18px] bg-white/72 px-4 py-3">{content}</div>;
}

function ReportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] px-4 py-5 text-sm font-bold">
      <Download className="h-4 w-4" />
      {label}
    </button>
  );
}

function ReportPeriodButton({ period, active, onClick }: { period: ReportPeriod; active: boolean; onClick: () => void }) {
  const labels: Record<ReportPeriod, string> = {
    day: "Hoy",
    week: "Semana",
    month: "Mes",
    custom: "Rango",
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active ? "bg-[var(--color-mocha)] text-white" : "bg-white/75 text-[var(--color-copy)] hover:bg-white"
      }`}
    >
      {labels[period]}
    </button>
  );
}

function ReportSummaryRow({ row }: { row: InventoryUsageSummaryRow }) {
  return (
    <div className="rounded-[18px] bg-[rgba(247,242,236,0.74)] px-4 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-[var(--color-ink)]">{row.itemName}</p>
          <p className="mt-1 text-sm text-[var(--color-copy)]">
            Total {formatInventoryNumber(row.totalQuantity)} {row.unitLabel} - Pacientes {formatInventoryNumber(row.patientQuantity)} - Interno {formatInventoryNumber(row.internalQuantity)} - Merma {formatInventoryNumber(row.wasteQuantity)}
          </p>
        </div>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{formatMoney(row.estimatedCost)}</span>
      </div>
    </div>
  );
}

function ReportResponsibleRow({ row }: { row: InventoryResponsibleReportRow }) {
  return (
    <div className="rounded-[18px] bg-[rgba(247,242,236,0.74)] px-4 py-3">
      <p className="font-semibold text-[var(--color-ink)]">{row.responsable}</p>
      <p className="mt-1 text-sm text-[var(--color-copy)]">
        Movimientos {row.movimientos} - Conteos {row.conteos} - Consumo estimado {formatMoney(row.valor_consumido)}
      </p>
    </div>
  );
}

function ReportUsageRow({ row }: { row: InventoryUsageReportRow }) {
  return (
    <div className="rounded-[18px] bg-[rgba(247,242,236,0.74)] px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{row.reportType}</span>
        <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{formatDate(row.date)}</span>
        <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{row.responsible}</span>
      </div>
      <p className="mt-2 font-semibold text-[var(--color-ink)]">{row.itemName}</p>
      <p className="mt-1 text-sm text-[var(--color-copy)]">
        {formatInventoryNumber(row.quantity)} {row.unitLabel} - {row.patient || "Sin paciente"} - {row.lotLabel || "Sin lote"}
      </p>
    </div>
  );
}

function ReportCountRow({ row }: { row: InventoryCountReportRow }) {
  return (
    <div className="rounded-[18px] bg-[rgba(247,242,236,0.74)] px-4 py-3">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{formatDate(row.date)}</span>
        <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-bold text-[var(--color-copy)]">{row.countedBy}</span>
      </div>
      <p className="mt-2 font-semibold text-[var(--color-ink)]">{row.itemName}</p>
      <p className="mt-1 text-sm text-[var(--color-copy)]">
        Contado {formatInventoryNumber(row.countedStock)} {row.unitLabel} - Esperado {formatInventoryNumber(row.expectedStock)} - Dif. {formatInventoryNumber(row.differenceStock)}
      </p>
    </div>
  );
}

function InternalUsageBuilder({
  mode,
  search,
  setSearch,
  drafts,
  setDrafts,
  items,
  lots,
  itemMap,
  unitMap,
}: {
  mode: "entrada" | "salida";
  search: string;
  setSearch: (value: string) => void;
  drafts: InternalUsageDraft[];
  setDrafts: Dispatch<SetStateAction<InternalUsageDraft[]>>;
  items: InventoryItemRow[];
  lots: InventoryLotRow[];
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
}) {
  const isEntry = mode === "entrada";
  const normalizedSearch = normalizeSearchText(search);
  const resultItems = normalizedSearch
    ? items
        .filter((item) =>
          normalizeSearchText([
            item.name,
            item.sku,
            item.barcode,
            item.category,
            item.unit,
          ].join(" ")).includes(normalizedSearch)
        )
        .slice(0, 8)
    : [];
  const totals = buildInternalUsageDraftTotals(drafts, itemMap, unitMap);

  const updateDraft = (draftId: string, patch: Partial<InternalUsageDraft>) => {
    setDrafts((current) => current.map((draft) => (draft.id === draftId ? { ...draft, ...patch } : draft)));
  };

  return (
    <div className="grid gap-4">
      <Field label={isEntry ? "Buscar insumo para ingresar" : "Buscar insumo para descontar"}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nombre, SKU, categoria o codigo"
          className="premium-input"
        />
      </Field>

      {resultItems.length > 0 ? (
        <div className="grid gap-2">
          {resultItems.map((item) => {
            const unitLabel = getItemUnitLabel(item, unitMap);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDrafts((current) => [...current, createInternalUsageDraft(item.id)]);
                  setSearch("");
                }}
                className="flex flex-col gap-1 rounded-[18px] border border-[rgba(198,162,123,0.18)] bg-white/75 px-4 py-3 text-left transition hover:bg-white"
              >
                <span className="font-semibold text-[var(--color-ink)]">{item.name}</span>
                <span className="text-xs text-[var(--color-copy)]">
                  Stock actual {formatInventoryNumber(item.current_stock)} {unitLabel} - {item.sku ?? "Sin SKU"}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-3">
        {drafts.length === 0 ? (
          <EmptyState label={isEntry ? "Sin entradas agregadas." : "Sin descuentos agregados."} />
        ) : (
          drafts.map((draft) => {
            const item = itemMap.get(draft.item_id);
            const unitLabel = getItemUnitLabel(item, unitMap);
            const itemLots = lots.filter((lot) => lot.item_id === draft.item_id && !lot.is_deleted && (isEntry || Number(lot.current_quantity ?? 0) > 0));
            return (
              <div key={draft.id} className="rounded-[20px] border border-[rgba(198,162,123,0.18)] bg-[rgba(247,242,236,0.74)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{item?.name ?? "Insumo"}</p>
                    <p className="mt-1 text-xs text-[var(--color-copy)]">Disponible {formatInventoryNumber(item?.current_stock)} {unitLabel}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDrafts((current) => current.filter((row) => row.id !== draft.id))}
                    className="w-fit rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-bold"
                  >
                    Quitar
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <SelectField
                    label={isEntry ? "Lote existente (opcional)" : "Lote"}
                    value={draft.lot_id}
                    onChange={(lot_id) => updateDraft(draft.id, { lot_id })}
                    options={itemLots.map((lot) => ({
                      value: lot.id,
                      label: `${lot.lot_number} - ${formatInventoryNumber(lot.current_quantity)} ${unitLabel}`,
                    }))}
                  />
                  <NumberField label={`Cantidad (${unitLabel})`} value={draft.quantity} onChange={(quantity) => updateDraft(draft.id, { quantity })} />
                  <TextField label={isEntry ? "Nota de ingreso" : "Nota"} value={draft.reason} onChange={(reason) => updateDraft(draft.id, { reason })} />
                </div>
              </div>
            );
          })
        )}
      </div>

      {totals.length > 0 ? (
        <div className="grid gap-2 rounded-[18px] bg-white/75 p-4">
          {totals.map((row) => (
            <p key={row.key} className="text-sm font-semibold text-[var(--color-ink)]">
              {row.itemName}: {formatInventoryNumber(row.quantity)} {row.unitLabel}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
      <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl overflow-y-auto rounded-[32px] bg-[var(--color-surface)] p-5 shadow-[0_30px_90px_rgba(43,33,27,0.25)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-4xl font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">Cerrar</button>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function modalTitle(modal: Exclude<ModalKey, null>, editing: boolean) {
  const labels: Record<Exclude<ModalKey, null>, string> = {
    item: "item",
    category: "categoria",
    unit: "unidad",
    supplier: "proveedor",
    location: "ubicacion",
    lot: "lote",
    movement: "movimiento",
    count: "conteo",
    shift: "turno",
  };
  return `${editing ? "Editar" : "Nuevo"} ${labels[modal]}`;
}

function renderModalFields(props: {
  modal: Exclude<ModalKey, null>;
  itemForm: typeof emptyItemForm;
  setItemForm: (value: typeof emptyItemForm) => void;
  categoryForm: typeof emptyCategoryForm;
  setCategoryForm: (value: typeof emptyCategoryForm) => void;
  unitForm: typeof emptyUnitForm;
  setUnitForm: (value: typeof emptyUnitForm) => void;
  supplierForm: typeof emptySupplierForm;
  setSupplierForm: (value: typeof emptySupplierForm) => void;
  locationForm: typeof emptyLocationForm;
  setLocationForm: (value: typeof emptyLocationForm) => void;
  lotForm: typeof emptyLotForm;
  setLotForm: (value: typeof emptyLotForm) => void;
  movementForm: typeof emptyMovementForm;
  setMovementForm: (value: typeof emptyMovementForm) => void;
  movementSearch: string;
  setMovementSearch: (value: string) => void;
  internalUsageDrafts: InternalUsageDraft[];
  setInternalUsageDrafts: Dispatch<SetStateAction<InternalUsageDraft[]>>;
  countForm: typeof emptyCountForm;
  setCountForm: (value: typeof emptyCountForm) => void;
  shiftForm: typeof emptyShiftForm;
  setShiftForm: (value: typeof emptyShiftForm) => void;
  items: InventoryItemRow[];
  categories: InventoryCategoryRow[];
  units: InventoryUnitRow[];
  suppliers: InventorySupplierRow[];
  locations: InventoryLocationRow[];
  lots: InventoryLotRow[];
  itemMap: Map<string, InventoryItemRow>;
  canManageInventoryCorrections: boolean;
}) {
  if (props.modal === "item") {
    const f = props.itemForm;
    const set = props.setItemForm;
    const consumptionUnit = props.units.find((unit) => unit.id === f.unit_id)?.abbreviation ?? "u";
    const presentationUnit = props.units.find((unit) => unit.id === f.presentation_unit_id)?.abbreviation ?? "presentacion";
    const usesPresentation = hasPresentationConfig(f.presentation_unit_id, f.units_per_presentation);
    const projectedCurrentStock = usesPresentation
      ? toInternalQuantity(Number(f.current_stock_presentations), Number(f.units_per_presentation))
      : Number(f.current_stock);
    const projectedMinimumStock = usesPresentation
      ? toInternalQuantity(Number(f.minimum_stock_presentations), Number(f.units_per_presentation))
      : Number(f.minimum_stock);
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nombre" value={f.name} onChange={(name) => set({ ...f, name })} />
        <SelectField label="Tipo" value={f.item_type} onChange={(item_type) => set({ ...f, item_type })} options={["insumo", "producto", "material", "equipo"].map((value) => ({ value, label: value }))} />
        <SelectField label="Categoria" value={f.category_id} onChange={(category_id) => set({ ...f, category_id })} options={props.categories.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField label="SKU" value={f.sku} onChange={(sku) => set({ ...f, sku })} />
        <TextField label="Codigo de barras" value={f.barcode} onChange={(barcode) => set({ ...f, barcode })} />
        <SelectField label="Unidad que se usa en consulta" value={f.unit_id} onChange={(unit_id) => set({ ...f, unit_id })} options={props.units.map((u) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))} />
        <SelectField label="Se compra en" value={f.presentation_unit_id} onChange={(presentation_unit_id) => set({ ...f, presentation_unit_id })} options={props.units.map((u) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))} />
        <NumberField label="Cuantas unidades de uso trae cada presentacion" value={f.units_per_presentation} onChange={(units_per_presentation) => set({ ...f, units_per_presentation })} />
        <InlineHint
          text={
            usesPresentation
              ? `Configuración activa: 1 ${presentationUnit} = ${formatInventoryNumber(Number(f.units_per_presentation))} ${consumptionUnit}. Escribe abajo el stock en ${presentationUnit} y el sistema lo convertirá solo.`
              : "Usa estos campos solo si el insumo se compra por caja, frasco o ampolla, pero en consulta se descuenta por unidades internas."
          }
        />
        <CityField label="Ciudad" value={f.city} onChange={(city) => set({ ...f, city })} />
        <SelectField label="Ubicacion" value={f.location_id} onChange={(location_id) => set({ ...f, location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <SelectField label="Proveedor principal" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        {props.canManageInventoryCorrections && usesPresentation ? (
          <>
            <NumberField label={`Stock actual en ${presentationUnit}`} value={f.current_stock_presentations} onChange={(current_stock_presentations) => set({ ...f, current_stock_presentations })} />
            <NumberField label={`Stock minimo en ${presentationUnit}`} value={f.minimum_stock_presentations} onChange={(minimum_stock_presentations) => set({ ...f, minimum_stock_presentations })} />
            <InlineHint text={`Ejemplo: si escribes ${formatInventoryNumber(Number(f.current_stock_presentations) || 0)} ${presentationUnit}, se guardaran ${formatInventoryNumber(projectedCurrentStock)} ${consumptionUnit}. El minimo quedara en ${formatInventoryNumber(projectedMinimumStock)} ${consumptionUnit}.`} />
          </>
        ) : props.canManageInventoryCorrections ? (
          <>
            <NumberField label={`Stock actual en ${consumptionUnit}`} value={f.current_stock} onChange={(current_stock) => set({ ...f, current_stock })} />
            <NumberField label={`Stock minimo en ${consumptionUnit}`} value={f.minimum_stock} onChange={(minimum_stock) => set({ ...f, minimum_stock })} />
          </>
        ) : (
          <>
            <ReadOnlyMetric label="Stock actual" value={formatStockSummary(Number(f.current_stock ?? 0), consumptionUnit, f.presentation_unit_id, Number(f.units_per_presentation), new Map(props.units.map((unit) => [unit.id, unit])))} />
            {usesPresentation ? (
              <NumberField label={`Stock minimo en ${presentationUnit}`} value={f.minimum_stock_presentations} onChange={(minimum_stock_presentations) => set({ ...f, minimum_stock_presentations })} />
            ) : (
              <NumberField label={`Stock minimo en ${consumptionUnit}`} value={f.minimum_stock} onChange={(minimum_stock) => set({ ...f, minimum_stock })} />
            )}
            <InlineHint text="Solo Superusuario o Administrador/a puede cambiar el stock actual directo. Para aumentar o descontar inventario usa movimientos, lotes, pedidos o cierre de turno." />
          </>
        )}
        <NumberField label="Costo unitario" value={f.reference_cost} onChange={(reference_cost) => set({ ...f, reference_cost })} />
        <NumberField label="Precio referencial" value={f.sale_price} onChange={(sale_price) => set({ ...f, sale_price })} />
        <TextField label="Lote actual" value={f.lot_number} onChange={(lot_number) => set({ ...f, lot_number })} />
        <Field label="Vencimiento"><input type="date" value={f.expiration_date} onChange={(event) => set({ ...f, expiration_date: event.target.value })} className="premium-input" /></Field>
        <NumberField label="Dias de alerta por vencimiento" value={f.alert_days_before_expiration} onChange={(alert_days_before_expiration) => set({ ...f, alert_days_before_expiration })} />
        <TextareaField label="Notas" value={f.notes} onChange={(notes) => set({ ...f, notes })} />
      </div>
    );
  }

  if (props.modal === "category") return <SimpleNameDescription form={props.categoryForm} setForm={props.setCategoryForm} />;
  if (props.modal === "location") return <LocationFields form={props.locationForm} setForm={props.setLocationForm} />;
  if (props.modal === "supplier") return <SupplierFields form={props.supplierForm} setForm={props.setSupplierForm} />;
  if (props.modal === "unit") return <UnitFields form={props.unitForm} setForm={props.setUnitForm} units={props.units} />;

  if (props.modal === "lot") {
    const f = props.lotForm;
    const set = props.setLotForm;
    const item = props.itemMap.get(f.item_id);
    const consumptionUnit = props.units.find((unit) => unit.id === item?.unit_id)?.abbreviation ?? item?.unit ?? "u";
    const presentationUnit = props.units.find((unit) => unit.id === f.presentation_unit_id)?.abbreviation ?? "presentacion";
    const usesPresentation = hasPresentationConfig(f.presentation_unit_id, f.units_per_presentation);
    const projectedInitialStock = usesPresentation
      ? toInternalQuantity(Number(f.initial_quantity_presentations), Number(f.units_per_presentation))
      : Number(f.initial_quantity);
    const projectedCurrentStock = usesPresentation
      ? toInternalQuantity(Number(f.current_quantity_presentations), Number(f.units_per_presentation))
      : Number(f.current_quantity);
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Item" value={f.item_id} onChange={(item_id) => {
          const item = props.itemMap.get(item_id);
          set({
            ...f,
            item_id,
            presentation_unit_id: item?.presentation_unit_id ?? "",
            units_per_presentation: Number(item?.units_per_presentation ?? 1),
            initial_quantity_presentations: Number(item?.units_per_presentation ?? 1) > 1 ? 0 : f.initial_quantity_presentations,
            current_quantity_presentations: Number(item?.units_per_presentation ?? 1) > 1 ? 0 : f.current_quantity_presentations,
          });
        }} options={props.items.map((i) => ({ value: i.id, label: i.name }))} />
        <TextField label="Numero de lote" value={f.lot_number} onChange={(lot_number) => set({ ...f, lot_number })} />
        <SelectField label="Proveedor" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <SelectField label="Ubicacion" value={f.location_id} onChange={(location_id) => set({ ...f, location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <SelectField label="El lote entra en" value={f.presentation_unit_id} onChange={(presentation_unit_id) => set({ ...f, presentation_unit_id })} options={props.units.map((u) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))} />
        <NumberField label="Cuantas unidades de uso trae cada presentacion" value={f.units_per_presentation} onChange={(units_per_presentation) => set({ ...f, units_per_presentation })} />
        <InlineHint
          text={
            usesPresentation
              ? `Este lote se convertira usando 1 ${presentationUnit} = ${formatInventoryNumber(Number(f.units_per_presentation))} ${consumptionUnit}.`
              : "Si el lote llega por caja o frasco, selecciona la presentacion y cuantas unidades reales contiene."
          }
        />
        <Field label="Fecha de recepcion"><input type="date" value={f.received_date} onChange={(event) => set({ ...f, received_date: event.target.value })} className="premium-input" /></Field>
        <Field label="Vencimiento"><input type="date" value={f.expiration_date} onChange={(event) => set({ ...f, expiration_date: event.target.value })} className="premium-input" /></Field>
        {usesPresentation ? (
          <>
            <NumberField label={`Cantidad inicial en ${presentationUnit}`} value={f.initial_quantity_presentations} onChange={(initial_quantity_presentations) => set({ ...f, initial_quantity_presentations })} />
            <NumberField label={`Cantidad actual en ${presentationUnit}`} value={f.current_quantity_presentations} onChange={(current_quantity_presentations) => set({ ...f, current_quantity_presentations })} />
            <InlineHint text={`Se guardara como ${formatInventoryNumber(projectedInitialStock)} ${consumptionUnit} iniciales y ${formatInventoryNumber(projectedCurrentStock)} ${consumptionUnit} disponibles.`} />
          </>
        ) : (
          <>
            <NumberField label={`Cantidad inicial en ${consumptionUnit}`} value={f.initial_quantity} onChange={(initial_quantity) => set({ ...f, initial_quantity })} />
            <NumberField label={`Cantidad actual en ${consumptionUnit}`} value={f.current_quantity} onChange={(current_quantity) => set({ ...f, current_quantity })} />
          </>
        )}
        <NumberField label="Costo unitario" value={f.unit_cost} onChange={(unit_cost) => set({ ...f, unit_cost })} />
        <TextareaField label="Notas" value={f.notes} onChange={(notes) => set({ ...f, notes })} />
      </div>
    );
  }

  if (props.modal === "movement") {
    const f = props.movementForm;
    const set = props.setMovementForm;
    const movementTypeOptions = [
      { value: "entrada", label: "Entrada / compra" },
      { value: "salida", label: "Uso interno / descuento manual" },
      { value: "merma", label: "Merma / vencido / descarte" },
      { value: "transferencia", label: "Transferencia" },
      { value: "ajuste", label: "Ajuste positivo" },
    ];
    const movementTypeField = (
      <SelectField
        label="Tipo de movimiento"
        value={f.movement_type}
        onChange={(movement_type) => set({ ...f, movement_type: movement_type as InventoryMovementRow["movement_type"] })}
        options={movementTypeOptions}
      />
    );

    if (f.movement_type === "entrada" || f.movement_type === "salida") {
      const isEntry = f.movement_type === "entrada";
      return (
        <div className="grid gap-4">
          {movementTypeField}
          <InternalUsageBuilder
            mode={f.movement_type}
            search={props.movementSearch}
            setSearch={props.setMovementSearch}
            drafts={props.internalUsageDrafts}
            setDrafts={props.setInternalUsageDrafts}
            items={props.items}
            lots={props.lots}
            itemMap={props.itemMap}
            unitMap={new Map(props.units.map((unit) => [unit.id, unit]))}
          />
          <div className="grid gap-4 md:grid-cols-2">
            {isEntry ? (
              <>
                <SelectField label="Proveedor" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                <SelectField label="Ubicacion de ingreso" value={f.to_location_id} onChange={(to_location_id) => set({ ...f, to_location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
                <NumberField label="Costo unitario general" value={f.unit_cost} onChange={(unit_cost) => set({ ...f, unit_cost })} />
              </>
            ) : null}
            <TextField label="Referencia" value={f.reference} onChange={(reference) => set({ ...f, reference })} />
            <Field label="Fecha"><input type="datetime-local" value={f.movement_date} onChange={(event) => set({ ...f, movement_date: event.target.value })} className="premium-input" /></Field>
            <TextareaField label="Motivo general" value={f.reason} onChange={(reason) => set({ ...f, reason })} />
          </div>
        </div>
      );
    }

    const itemLots = props.lots.filter((lot) => lot.item_id === f.item_id);
    const selectedItem = props.itemMap.get(f.item_id);
    const movementUnit = props.units.find((unit) => unit.id === selectedItem?.unit_id)?.abbreviation ?? selectedItem?.unit ?? "u";
    const movementPresentation = props.units.find((unit) => unit.id === selectedItem?.presentation_unit_id)?.abbreviation ?? "presentacion";
    const movementUnitsPerPresentation = Number(selectedItem?.units_per_presentation ?? 1);
    const movementUsesPresentation = hasPresentationConfig(selectedItem?.presentation_unit_id, selectedItem?.units_per_presentation);
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Item" value={f.item_id} onChange={(item_id) => set({ ...f, item_id, lot_id: "" })} options={props.items.map((i) => ({ value: i.id, label: i.name }))} />
        {movementTypeField}
        <NumberField label={`Cantidad en ${movementUnit}`} value={f.quantity} onChange={(quantity) => set({ ...f, quantity })} />
        {movementUsesPresentation ? (
          <InlineHint text={`Este movimiento se registra en ${movementUnit}. Ejemplo: 1 ${movementPresentation} = ${formatInventoryNumber(movementUnitsPerPresentation)} ${movementUnit}.`} />
        ) : null}
        <NumberField label="Costo unitario" value={f.unit_cost} onChange={(unit_cost) => set({ ...f, unit_cost })} />
        <SelectField label="Lote" value={f.lot_id} onChange={(lot_id) => set({ ...f, lot_id })} options={itemLots.map((l) => ({ value: l.id, label: l.lot_number }))} />
        <SelectField label="Proveedor" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <SelectField label="Desde ubicación" value={f.from_location_id} onChange={(from_location_id) => set({ ...f, from_location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <SelectField label="Hacia ubicación" value={f.to_location_id} onChange={(to_location_id) => set({ ...f, to_location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <TextField label="Referencia" value={f.reference} onChange={(reference) => set({ ...f, reference })} />
        <Field label="Fecha"><input type="datetime-local" value={f.movement_date} onChange={(event) => set({ ...f, movement_date: event.target.value })} className="premium-input" /></Field>
        <TextareaField label="Motivo" value={f.reason} onChange={(reason) => set({ ...f, reason })} />
      </div>
    );
  }

  if (props.modal === "shift") {
    const f = props.shiftForm;
    const set = props.setShiftForm;
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nombre del turno" value={f.shift_name} onChange={(shift_name) => set({ ...f, shift_name })} />
        <SelectField label="Ubicacion" value={f.location_id} onChange={(location_id) => set({ ...f, location_id })} options={props.locations.map((location) => ({ value: location.id, label: location.name }))} />
        <Field label="Fecha"><input type="date" value={f.count_date} onChange={(event) => set({ ...f, count_date: event.target.value })} className="premium-input" /></Field>
        <InlineHint text="Al abrir el turno se crea una línea por cada ítem activo de esa ubicación con el stock actual como lo dejado por el turno anterior." />
        <TextareaField label="Notas de apertura" value={f.notes} onChange={(notes) => set({ ...f, notes })} />
      </div>
    );
  }

  const f = props.countForm;
  const set = props.setCountForm;
  const countedItem = props.itemMap.get(f.item_id);
  const countUnit = props.units.find((unit) => unit.id === countedItem?.unit_id)?.abbreviation ?? countedItem?.unit ?? "u";
  const countPresentation = props.units.find((unit) => unit.id === countedItem?.presentation_unit_id)?.abbreviation ?? "presentacion";
  const countUnitsPerPresentation = Number(countedItem?.units_per_presentation ?? 1);
  const countUsesPresentation = hasPresentationConfig(countedItem?.presentation_unit_id, countedItem?.units_per_presentation);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField label="Item" value={f.item_id} onChange={(item_id) => {
        const item = props.itemMap.get(item_id);
        set({ ...f, item_id, counted_stock: Number(item?.current_stock ?? 0) });
      }} options={props.items.map((i) => ({ value: i.id, label: i.name }))} />
      <NumberField label={`Stock contado en ${countUnit}`} value={f.counted_stock} onChange={(counted_stock) => set({ ...f, counted_stock })} />
      {countUsesPresentation ? (
        <InlineHint text={`Si fisicamente cuentas ${countPresentation}, conviertelo antes de guardar. Ejemplo: 8 ${countPresentation} x ${formatInventoryNumber(countUnitsPerPresentation)} = ${formatInventoryNumber(8 * countUnitsPerPresentation)} ${countUnit}.`} />
      ) : null}
      <SelectField label="Ubicacion" value={f.location_id} onChange={(location_id) => set({ ...f, location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
      <Field label="Fecha"><input type="date" value={f.count_date} onChange={(event) => set({ ...f, count_date: event.target.value })} className="premium-input" /></Field>
      <TextareaField label="Notas" value={f.notes} onChange={(notes) => set({ ...f, notes })} />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><input value={value} onChange={(event) => onChange(event.target.value)} className="premium-input" /></Field>;
}

function CityField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="premium-input">
        <option value="">Selecciona ciudad</option>
        {boliviaCities.map((city) => (
          <option key={city} value={city}>
            {city}
          </option>
        ))}
      </select>
    </Field>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={label}><input type="number" step="0.01" value={String(value)} onChange={(event) => onChange(Number(event.target.value))} className="premium-input" /></Field>;
}

function ReadOnlyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-2 rounded-[18px] border border-[var(--color-border)] bg-white/70 px-4 py-3 text-sm font-semibold text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}

function InlineHint({ text }: { text: string }) {
  return <p className="md:col-span-2 text-xs leading-6 text-[var(--color-copy)]">{text}</p>;
}

function TextareaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label} className="md:col-span-2"><textarea value={value} onChange={(event) => onChange(event.target.value)} className="premium-input min-h-28" /></Field>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="premium-input">
        <option value="">Seleccionar</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function SimpleNameDescription({ form, setForm }: { form: typeof emptyCategoryForm; setForm: (value: typeof emptyCategoryForm) => void }) {
  return (
    <div className="grid gap-4">
      <TextField label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <TextareaField label="Descripcion" value={form.description} onChange={(description) => setForm({ ...form, description })} />
    </div>
  );
}

function LocationFields({ form, setForm }: { form: typeof emptyLocationForm; setForm: (value: typeof emptyLocationForm) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <CityField label="Ciudad" value={form.city} onChange={(city) => setForm({ ...form, city })} />
      <TextareaField label="Descripcion" value={form.description} onChange={(description) => setForm({ ...form, description })} />
    </div>
  );
}

function SupplierFields({ form, setForm }: { form: typeof emptySupplierForm; setForm: (value: typeof emptySupplierForm) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Proveedor" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <TextField label="Contacto" value={form.contact_name} onChange={(contact_name) => setForm({ ...form, contact_name })} />
      <TextField label="Telefono" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
      <TextField label="WhatsApp" value={form.whatsapp_phone} onChange={(whatsapp_phone) => setForm({ ...form, whatsapp_phone })} />
      <TextField label="Email" value={form.email} onChange={(email) => setForm({ ...form, email })} />
      <TextField label="Direccion" value={form.address} onChange={(address) => setForm({ ...form, address })} />
      <TextField label="NIT o referencia fiscal" value={form.tax_id} onChange={(tax_id) => setForm({ ...form, tax_id })} />
      <NumberField label="Plazo de pago en días" value={form.payment_terms_days} onChange={(payment_terms_days) => setForm({ ...form, payment_terms_days })} />
      <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 py-3 text-sm font-semibold">
        <input type="checkbox" checked={form.allows_consignment} onChange={(event) => setForm({ ...form, allows_consignment: event.target.checked })} />
        Maneja consignacion
      </label>
      <TextareaField label="Notas" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} />
    </div>
  );
}

function UnitFields({ form, setForm, units }: { form: typeof emptyUnitForm; setForm: (value: typeof emptyUnitForm) => void; units: InventoryUnitRow[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} />
      <TextField label="Abreviatura" value={form.abbreviation} onChange={(abbreviation) => setForm({ ...form, abbreviation })} />
      <SelectField label="Tipo" value={form.unit_type} onChange={(unit_type) => setForm({ ...form, unit_type: unit_type as InventoryUnitRow["unit_type"] })} options={["unidad", "peso", "volumen", "empaque"].map((value) => ({ value, label: value }))} />
      <SelectField label="Unidad base" value={form.base_unit_id} onChange={(base_unit_id) => setForm({ ...form, base_unit_id })} options={units.map((unit) => ({ value: unit.id, label: unit.name }))} />
      <NumberField label="Factor de conversion" value={form.conversion_factor} onChange={(conversion_factor) => setForm({ ...form, conversion_factor })} />
      <label className="flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white/60 px-4 py-3 text-sm font-semibold">
        <input type="checkbox" checked={form.is_base_unit} onChange={(event) => setForm({ ...form, is_base_unit: event.target.checked })} />
        Es unidad base
      </label>
    </div>
  );
}

function itemToForm(item: InventoryItemRow) {
  const usesPresentation = hasPresentationConfig(item.presentation_unit_id, item.units_per_presentation);
  return {
    name: item.name,
    item_type: item.item_type ?? "insumo",
    category_id: item.category_id ?? "",
    sku: item.sku ?? "",
    barcode: item.barcode ?? "",
    unit_id: item.unit_id ?? "",
    presentation_unit_id: item.presentation_unit_id ?? "",
    city: item.city ?? "",
    location_id: item.location_id ?? "",
    supplier_id: item.supplier_id ?? "",
    current_stock: Number(item.current_stock ?? 0),
    minimum_stock: Number(item.minimum_stock ?? 0),
    units_per_presentation: Number(item.units_per_presentation ?? 1),
    current_stock_presentations: usesPresentation ? toPresentationQuantity(Number(item.current_stock ?? 0), Number(item.units_per_presentation ?? 1)) : Number(item.current_stock ?? 0),
    minimum_stock_presentations: usesPresentation ? toPresentationQuantity(Number(item.minimum_stock ?? 0), Number(item.units_per_presentation ?? 1)) : Number(item.minimum_stock ?? 0),
    reference_cost: Number(item.reference_cost ?? 0),
    sale_price: Number(item.sale_price ?? 0),
    lot_number: item.lot_number ?? "",
    expiration_date: item.expiration_date ?? "",
    alert_days_before_expiration: Number(item.alert_days_before_expiration ?? 30),
    notes: item.notes ?? "",
    is_active: item.is_active,
  };
}

function lotToForm(lot: InventoryLotRow) {
  const usesPresentation = hasPresentationConfig(lot.presentation_unit_id, lot.units_per_presentation);
  return {
    item_id: lot.item_id,
    lot_number: lot.lot_number,
    supplier_id: lot.supplier_id ?? "",
    location_id: lot.location_id ?? "",
    presentation_unit_id: lot.presentation_unit_id ?? "",
    received_date: lot.received_date ?? "",
    expiration_date: lot.expiration_date ?? "",
    initial_quantity: Number(lot.initial_quantity ?? 0),
    current_quantity: Number(lot.current_quantity ?? 0),
    units_per_presentation: Number(lot.units_per_presentation ?? 1),
    initial_quantity_presentations: usesPresentation ? toPresentationQuantity(Number(lot.initial_quantity ?? 0), Number(lot.units_per_presentation ?? 1)) : Number(lot.initial_quantity ?? 0),
    current_quantity_presentations: usesPresentation ? toPresentationQuantity(Number(lot.current_quantity ?? 0), Number(lot.units_per_presentation ?? 1)) : Number(lot.current_quantity ?? 0),
    unit_cost: Number(lot.unit_cost ?? 0),
    notes: lot.notes ?? "",
    is_active: lot.is_active,
  };
}

function pickCategory(row: InventoryCategoryRow) {
  return { name: row.name, description: row.description ?? "", is_active: row.is_active };
}

function pickLocation(row: InventoryLocationRow) {
  return { name: row.name, city: row.city ?? "", description: row.description ?? "", is_active: row.is_active };
}

function pickSupplier(row: InventorySupplierRow) {
  return {
    name: row.name,
    contact_name: row.contact_name ?? "",
    phone: row.phone ?? "",
    whatsapp_phone: row.whatsapp_phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    tax_id: row.tax_id ?? "",
    payment_terms_days: Number(row.payment_terms_days ?? 0),
    allows_consignment: row.allows_consignment,
    notes: row.notes ?? "",
    is_active: row.is_active,
  };
}

function pickUnit(row: InventoryUnitRow) {
  return {
    name: row.name,
    abbreviation: row.abbreviation,
    unit_type: row.unit_type,
    is_base_unit: row.is_base_unit,
    base_unit_id: row.base_unit_id ?? "",
    conversion_factor: Number(row.conversion_factor ?? 1),
    is_active: row.is_active,
  };
}

function unitPayload(form: typeof emptyUnitForm) {
  return { ...form, base_unit_id: normalizeText(form.base_unit_id), conversion_factor: Number(form.conversion_factor) };
}

function formatInventoryNumber(value?: number | string | null) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toLocaleString("es-BO", { maximumFractionDigits: 2 });
}

function formatInventoryShiftAudit(count: InventoryCountRow) {
  const openedBy = formatInventoryShiftActor(count.opened_by_profile, count.opened_by ?? count.created_by, "responsable sin identificar");
  const openedAt = formatDateTime(count.opened_at ?? count.created_at);
  const closedBy = count.closed_by ? formatInventoryShiftActor(count.closed_by_profile, count.closed_by, "responsable sin identificar") : null;
  const closedAt = formatDateTime(count.closed_at);
  const reopenedBy = count.last_reopened_by ? formatInventoryShiftActor(count.last_reopened_by_profile, count.last_reopened_by, "Superusuario") : null;
  const reopenedAt = formatDateTime(count.last_reopened_at);
  const parts = [`Apertura: ${openedAt || "sin fecha"} por ${openedBy}`];

  if (Number(count.reopen_count ?? 0) > 0) {
    parts.push(`Reabierto ${count.reopen_count} vez/veces${reopenedAt ? `: ${reopenedAt}` : ""}${reopenedBy ? ` por ${reopenedBy}` : ""}`);
  }

  if (count.status === "cerrado") {
    parts.push(`Cierre: ${closedAt || "sin fecha"} por ${closedBy ?? "sin responsable"}`);
  } else {
    parts.push("Pendiente de cierre por la responsable o Superusuario");
  }

  return parts.join(" - ");
}

function formatInventoryShiftActor(
  actor: InventoryCountRow["opened_by_profile"] | InventoryCountRow["closed_by_profile"] | null | undefined,
  actorId?: string | null,
  fallback = "equipo medico"
) {
  return actor?.full_name ?? actor?.email ?? actorId ?? fallback;
}

function formatActorLabel(
  actor: InventoryCountRow["opened_by_profile"] | InventoryCountRow["closed_by_profile"] | null | undefined,
  actorId?: string | null,
  fallback = "Sin responsable"
) {
  return actor?.full_name ?? actor?.email ?? actorId ?? fallback;
}

function formatCountLineActors(lines: InventoryCountLineRow[]) {
  const actors = Array.from(
    new Set(
      lines
        .map((line) => formatActorLabel(line.counted_by_profile, line.counted_by, ""))
        .filter(Boolean)
    )
  );
  if (actors.length === 0) return "Sin responsable registrado";
  if (actors.length <= 3) return actors.join(", ");
  return `${actors.slice(0, 3).join(", ")} y ${actors.length - 3} mas`;
}

function movementTypeLabel(type: InventoryMovementRow["movement_type"]) {
  const labels: Record<InventoryMovementRow["movement_type"], string> = {
    entrada: "Entrada",
    salida: "Salida",
    merma: "Merma",
    transferencia: "Transferencia",
    ajuste: "Ajuste",
    conteo: "Conteo",
  };
  return labels[type] ?? type;
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatDateTime(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasPresentationConfig(presentationUnitId?: string | null, unitsPerPresentation?: number | null) {
  return Boolean(presentationUnitId) && Number(unitsPerPresentation ?? 0) > 1;
}

function toPresentationQuantity(internalQuantity: number, unitsPerPresentation: number) {
  if (unitsPerPresentation <= 0) return internalQuantity;
  return internalQuantity / unitsPerPresentation;
}

function toInternalQuantity(presentationQuantity: number, unitsPerPresentation: number) {
  return presentationQuantity * unitsPerPresentation;
}

function getUnitLabel(unitId: string | null | undefined, fallback: string | null | undefined, unitMap: Map<string, InventoryUnitRow>) {
  return unitMap.get(unitId ?? "")?.abbreviation ?? fallback ?? "u";
}

function formatStockSummary(
  quantity: number,
  unitLabel: string,
  presentationUnitId: string | null | undefined,
  unitsPerPresentation: number,
  unitMap: Map<string, InventoryUnitRow>
) {
  const base = `${formatInventoryNumber(quantity)} ${unitLabel}`;
  const presentationUnit = unitMap.get(presentationUnitId ?? "");
  const presentationLabel =
    presentationUnit?.abbreviation && presentationUnit.abbreviation !== unitLabel
      ? presentationUnit.abbreviation
      : presentationUnit?.name && presentationUnit.name !== unitLabel
        ? presentationUnit.name
        : "presentaciones";
  const presentationSize = Number(unitsPerPresentation ?? 0);
  if (!presentationLabel || presentationSize <= 1) return base;
  const equivalentPresentations = quantity / presentationSize;
  if (equivalentPresentations >= 1) {
    return `${base} (equiv. ${formatInventoryNumber(equivalentPresentations)} ${presentationLabel})`;
  }
  return `${base} (config. ${formatInventoryNumber(presentationSize)} ${unitLabel} por ${presentationLabel})`;
}

function getLocalDateValue(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getDefaultReportRange(period: Exclude<ReportPeriod, "custom">): ReportRange {
  const today = startOfToday();
  if (period === "day") {
    const value = getLocalDateValue(today);
    return { startDate: value, endDate: value };
  }
  if (period === "week") {
    return { startDate: getLocalDateValue(addDays(today, -6)), endDate: getLocalDateValue(today) };
  }
  return {
    startDate: getLocalDateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    endDate: getLocalDateValue(today),
  };
}

function normalizeReportRange(range: ReportRange): ReportRange {
  const fallback = getDefaultReportRange("week");
  const startDate = range.startDate || fallback.startDate;
  const endDate = range.endDate || fallback.endDate;
  if (startDate > endDate) return { startDate: endDate, endDate: startDate };
  return { startDate, endDate };
}

function getReportDateValue(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return getLocalDateValue(parsed);
}

function isWithinReportRange(value: string | null | undefined, range: ReportRange) {
  const dateValue = getReportDateValue(value);
  return Boolean(dateValue) && dateValue >= range.startDate && dateValue <= range.endDate;
}

function getItemUnitLabel(item: InventoryItemRow | undefined, unitMap: Map<string, InventoryUnitRow>) {
  return getUnitLabel(item?.unit_id ?? null, item?.unit ?? "u", unitMap);
}

function createInternalUsageDraft(itemId: string): InternalUsageDraft {
  return {
    id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    item_id: itemId,
    lot_id: "",
    quantity: 1,
    reason: "",
  };
}

function buildInternalUsageDraftTotals(
  drafts: InternalUsageDraft[],
  itemMap: Map<string, InventoryItemRow>,
  unitMap: Map<string, InventoryUnitRow>
) {
  const totals = new Map<string, { key: string; itemName: string; quantity: number; unitLabel: string }>();
  drafts.forEach((draft) => {
    const item = itemMap.get(draft.item_id);
    const unitLabel = getItemUnitLabel(item, unitMap);
    const key = `${draft.item_id}-${unitLabel}`;
    const current = totals.get(key) ?? {
      key,
      itemName: item?.name ?? "Insumo",
      quantity: 0,
      unitLabel,
    };
    current.quantity += Number(draft.quantity ?? 0);
    totals.set(key, current);
  });
  return Array.from(totals.values());
}

function validateInternalUsageDrafts(
  drafts: InternalUsageDraft[],
  itemMap: Map<string, InventoryItemRow>,
  lots: InventoryLotRow[]
) {
  if (drafts.length === 0) {
    throw new Error("Agrega al menos un descuento interno.");
  }

  const itemTotals = new Map<string, number>();
  const lotTotals = new Map<string, number>();

  drafts.forEach((draft) => {
    const item = itemMap.get(draft.item_id);
    const quantity = Number(draft.quantity ?? 0);
    if (!item) throw new Error("Selecciona un insumo valido.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`La cantidad de ${item.name} debe ser mayor a cero.`);

    itemTotals.set(draft.item_id, (itemTotals.get(draft.item_id) ?? 0) + quantity);
    if (draft.lot_id) {
      const lot = lots.find((row) => row.id === draft.lot_id && row.item_id === draft.item_id && !row.is_deleted);
      if (!lot) throw new Error(`El lote elegido para ${item.name} no corresponde al insumo.`);
      lotTotals.set(draft.lot_id, (lotTotals.get(draft.lot_id) ?? 0) + quantity);
    }
  });

  itemTotals.forEach((quantity, itemId) => {
    const item = itemMap.get(itemId);
    if (item && quantity > Number(item.current_stock ?? 0)) {
      throw new Error(`No alcanza el stock de ${item.name}. Disponible: ${formatInventoryNumber(item.current_stock)}.`);
    }
  });

  lotTotals.forEach((quantity, lotId) => {
    const lot = lots.find((row) => row.id === lotId);
    const item = lot ? itemMap.get(lot.item_id) : null;
    if (lot && quantity > Number(lot.current_quantity ?? 0)) {
      throw new Error(`No alcanza el lote ${lot.lot_number} de ${item?.name ?? "insumo"}. Disponible: ${formatInventoryNumber(lot.current_quantity)}.`);
    }
  });
}

function validateInventoryEntryDrafts(
  drafts: InternalUsageDraft[],
  itemMap: Map<string, InventoryItemRow>,
  lots: InventoryLotRow[]
) {
  if (drafts.length === 0) {
    throw new Error("Agrega al menos una entrada de inventario.");
  }

  drafts.forEach((draft) => {
    const item = itemMap.get(draft.item_id);
    const quantity = Number(draft.quantity ?? 0);
    if (!item) throw new Error("Selecciona un insumo valido.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`La cantidad de ${item.name} debe ser mayor a cero.`);

    if (draft.lot_id) {
      const lot = lots.find((row) => row.id === draft.lot_id && row.item_id === draft.item_id && !row.is_deleted);
      if (!lot) throw new Error(`El lote elegido para ${item.name} no corresponde al insumo.`);
    }
  });
}

function estimateInventoryCost(quantity: number, item?: InventoryItemRow, unitCost?: number | null) {
  const cost = Number(unitCost ?? item?.reference_cost ?? 0);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return quantity * cost;
}

function movementReportType(type: InventoryMovementRow["movement_type"]): InventoryUsageReportRow["reportType"] {
  const labels: Record<InventoryMovementRow["movement_type"], InventoryUsageReportRow["reportType"]> = {
    entrada: "Entrada",
    salida: "Uso interno",
    merma: "Merma",
    transferencia: "Transferencia",
    ajuste: "Ajuste",
    conteo: "Diferencia de cierre",
  };
  return labels[type];
}

function buildInventoryUsageReportRows({
  clinicalUsages,
  movements,
  itemMap,
  categoryMap,
  unitMap,
  usageMovementIds,
  range,
}: {
  clinicalUsages: InventoryClinicalUsageRow[];
  movements: InventoryMovementRow[];
  itemMap: Map<string, InventoryItemRow>;
  categoryMap: Map<string, InventoryCategoryRow>;
  unitMap: Map<string, InventoryUnitRow>;
  usageMovementIds: Set<string>;
  range: ReportRange;
}) {
  const clinicalRows: InventoryUsageReportRow[] = clinicalUsages
    .filter((usage) => isWithinReportRange(usage.created_at, range))
    .map((usage) => {
      const item = itemMap.get(usage.item_id);
      const quantity = Number(usage.quantity ?? 0);
      return {
        id: `uso-${usage.id}`,
        date: getReportDateValue(usage.created_at),
        itemId: usage.item_id,
        itemName: usage.inventory_items?.name ?? item?.name ?? "Insumo",
        category: categoryMap.get(item?.category_id ?? "")?.name ?? item?.category ?? "",
        reportType: "Uso paciente" as const,
        quantity,
        unitLabel: usage.unit_label ?? getItemUnitLabel(item, unitMap),
        lotLabel: usage.inventory_lots?.lot_number ?? "",
        responsible: formatActorLabel(usage.created_by_profile, usage.created_by),
        patient: usage.patients?.full_name ?? "",
        notes: usage.notes ?? "",
        estimatedCost: estimateInventoryCost(quantity, item),
      };
    });

  const movementRows: InventoryUsageReportRow[] = movements
    .filter((movement) => isWithinReportRange(movement.movement_date, range))
    .filter((movement) => !usageMovementIds.has(movement.id))
    .map((movement) => {
      const item = itemMap.get(movement.item_id);
      const quantity = Number(movement.quantity ?? 0);
      return {
        id: `movimiento-${movement.id}`,
        date: getReportDateValue(movement.movement_date),
        itemId: movement.item_id,
        itemName: movement.item_name_snapshot ?? item?.name ?? "Insumo",
        category: categoryMap.get(item?.category_id ?? "")?.name ?? item?.category ?? "",
        reportType: movementReportType(movement.movement_type),
        quantity,
        unitLabel: getItemUnitLabel(item, unitMap),
        lotLabel: movement.lot_number_snapshot ?? "",
        responsible: formatActorLabel(movement.created_by_profile, movement.created_by),
        patient: "",
        notes: movement.reason ?? movement.reference ?? "",
        estimatedCost: estimateInventoryCost(quantity, item, movement.unit_cost),
      };
    });

  return [...clinicalRows, ...movementRows].sort((a, b) => b.date.localeCompare(a.date));
}

function buildInventoryUsageSummaryRows(rows: InventoryUsageReportRow[]) {
  const summaryMap = new Map<string, InventoryUsageSummaryRow>();
  rows
    .filter((row) => ["Uso paciente", "Uso interno", "Merma"].includes(row.reportType))
    .forEach((row) => {
      const key = `${row.itemId}-${row.unitLabel}`;
      const current = summaryMap.get(key) ?? {
        key,
        itemName: row.itemName,
        unitLabel: row.unitLabel,
        patientQuantity: 0,
        internalQuantity: 0,
        wasteQuantity: 0,
        totalQuantity: 0,
        estimatedCost: 0,
      };

      if (row.reportType === "Uso paciente") current.patientQuantity += row.quantity;
      if (row.reportType === "Uso interno") current.internalQuantity += row.quantity;
      if (row.reportType === "Merma") current.wasteQuantity += row.quantity;
      current.totalQuantity += row.quantity;
      current.estimatedCost += Number(row.estimatedCost ?? 0);
      summaryMap.set(key, current);
    });

  return Array.from(summaryMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
}

function buildInventoryCountReportRows({
  countLines,
  countMap,
  itemMap,
  unitMap,
  range,
}: {
  counts: InventoryCountRow[];
  countLines: InventoryCountLineRow[];
  countMap: Map<string, InventoryCountRow>;
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
  range: ReportRange;
}) {
  return countLines
    .map((line) => {
      const count = countMap.get(line.count_id);
      const item = itemMap.get(line.item_id);
      const date = getReportDateValue(count?.closed_at ?? count?.updated_at ?? count?.count_date ?? line.updated_at);
      return {
        id: line.id,
        date,
        shiftName: count?.shift_name || "Turno de inventario",
        itemName: item?.name ?? "Item",
        openingStock: Number(line.opening_stock ?? 0),
        expectedStock: Number(line.expected_stock ?? 0),
        countedStock: Number(line.counted_stock ?? 0),
        differenceStock: Number(line.difference_stock ?? 0),
        unitLabel: getItemUnitLabel(item, unitMap),
        countedBy: formatActorLabel(line.counted_by_profile, line.counted_by, "Sin responsable"),
        openedBy: count ? formatInventoryShiftActor(count.opened_by_profile, count.opened_by ?? count.created_by) : "Sin responsable",
        closedBy: count?.closed_by ? formatInventoryShiftActor(count.closed_by_profile, count.closed_by) : "",
        notes: line.notes ?? count?.notes ?? "",
      };
    })
    .filter((row) => row.date >= range.startDate && row.date <= range.endDate)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function buildInventoryResponsibleReportRows(usageRows: InventoryUsageReportRow[], countRows: InventoryCountReportRow[]): InventoryResponsibleReportRow[] {
  const responsibleMap = new Map<string, InventoryResponsibleReportRow>();
  const ensure = (responsable: string) => {
    const key = responsable || "Sin responsable";
    const current = responsibleMap.get(key) ?? { responsable: key, movimientos: 0, conteos: 0, valor_consumido: 0 };
    responsibleMap.set(key, current);
    return current;
  };

  usageRows.forEach((row) => {
    const current = ensure(row.responsible);
    current.movimientos += 1;
    if (["Uso paciente", "Uso interno", "Merma"].includes(row.reportType)) {
      current.valor_consumido += Number(row.estimatedCost ?? 0);
    }
  });

  countRows.forEach((row) => {
    const current = ensure(row.countedBy);
    current.conteos += 1;
  });

  return Array.from(responsibleMap.values()).sort((a, b) => (b.movimientos + b.conteos) - (a.movimientos + a.conteos));
}

function usageReportCsvRow(row: InventoryUsageReportRow) {
  return {
    fecha: row.date,
    tipo: row.reportType,
    item: row.itemName,
    categoria: row.category,
    cantidad: row.quantity,
    unidad: row.unitLabel,
    lote: row.lotLabel,
    responsable: row.responsible,
    paciente: row.patient,
    notas: row.notes,
    costo_estimado: row.estimatedCost,
  };
}

function usageSummaryCsvRow(row: InventoryUsageSummaryRow) {
  return {
    item: row.itemName,
    unidad: row.unitLabel,
    uso_pacientes: row.patientQuantity,
    uso_interno: row.internalQuantity,
    merma: row.wasteQuantity,
    total_consumido: row.totalQuantity,
    costo_estimado: row.estimatedCost,
  };
}

function countReportCsvRow(row: InventoryCountReportRow) {
  return {
    fecha: row.date,
    turno: row.shiftName,
    item: row.itemName,
    dejado: row.openingStock,
    esperado: row.expectedStock,
    contado: row.countedStock,
    diferencia: row.differenceStock,
    unidad: row.unitLabel,
    contado_por: row.countedBy,
    abierto_por: row.openedBy,
    cerrado_por: row.closedBy,
    notas: row.notes,
  };
}

function itemReport(
  item: InventoryItemRow,
  categoryMap: Map<string, InventoryCategoryRow>,
  unitMap: Map<string, InventoryUnitRow>,
  supplierMap: Map<string, InventorySupplierRow>,
  locationMap: Map<string, InventoryLocationRow>
) {
  return {
    nombre: item.name,
    tipo: item.item_type,
    categoria: categoryMap.get(item.category_id ?? "")?.name ?? item.category,
    sku: item.sku,
    codigo_barras: item.barcode,
    unidad_consumo: getUnitLabel(item.unit_id, item.unit, unitMap),
    presentacion_compra: unitMap.get(item.presentation_unit_id ?? "")?.abbreviation ?? unitMap.get(item.presentation_unit_id ?? "")?.name,
    unidades_por_presentacion: item.units_per_presentation,
    proveedor: supplierMap.get(item.supplier_id ?? "")?.name,
    ubicacion: locationMap.get(item.location_id ?? "")?.name,
    stock_actual: item.current_stock,
    stock_minimo: item.minimum_stock,
    costo: item.reference_cost,
    precio: item.sale_price,
    lote_actual: item.lot_number,
    vencimiento: item.expiration_date,
    archivado: item.is_deleted ? "Si" : "No",
  };
}

function lotReport(
  lot: InventoryLotRow,
  itemMap: Map<string, InventoryItemRow>,
  supplierMap: Map<string, InventorySupplierRow>,
  locationMap: Map<string, InventoryLocationRow>,
  unitMap: Map<string, InventoryUnitRow>
) {
  return {
    item: itemMap.get(lot.item_id)?.name,
    lote: lot.lot_number,
    proveedor: supplierMap.get(lot.supplier_id ?? "")?.name,
    ubicacion: locationMap.get(lot.location_id ?? "")?.name,
    presentacion_lote: unitMap.get(lot.presentation_unit_id ?? itemMap.get(lot.item_id)?.presentation_unit_id ?? "")?.abbreviation ?? unitMap.get(lot.presentation_unit_id ?? itemMap.get(lot.item_id)?.presentation_unit_id ?? "")?.name,
    unidades_por_presentacion: lot.units_per_presentation ?? itemMap.get(lot.item_id)?.units_per_presentation,
    recibido: lot.received_date,
    vencimiento: lot.expiration_date,
    cantidad_inicial: lot.initial_quantity,
    cantidad_actual: lot.current_quantity,
    costo: lot.unit_cost,
    archivado: lot.is_deleted ? "Si" : "No",
  };
}

function supplierPayload(form: typeof emptySupplierForm) {
  return {
    ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, typeof value === "string" ? normalizeText(value) : value])),
    payment_terms_days: Number(form.payment_terms_days),
    allows_consignment: Boolean(form.allows_consignment),
  };
}

function isExpiringSoon(value?: string | null, days = 30) {
  if (!value) return false;
  const diff = new Date(value).getTime() - startOfToday().getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function normalizeText(value?: string | null) {
  const next = String(value ?? "").trim();
  return next.length > 0 ? next : null;
}

function getInventorySubmitErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : error instanceof Error
        ? error.message
        : "";
  const detail = `${code} ${message}`.toLowerCase();

  if (
    detail.includes("pgrst204") ||
    detail.includes("schema cache") ||
    detail.includes("presentation_unit_id") ||
    detail.includes("units_per_presentation")
  ) {
    if (detail.includes("close_inventory_count")) {
      return "La base remota todavía no tiene aplicada la migración 20260619120000_inventory_count_closing.sql. Ejecútala en Supabase, recarga la página y vuelve a intentar.";
    }

    if (detail.includes("presentation_unit_id") || detail.includes("units_per_presentation")) {
      return "La base remota todavía no tiene aplicada la migración 20260529113000_inventory_presentations.sql. Ejecútala en Supabase, recarga la página y vuelve a intentar.";
    }

    return "La base remota todavía no tiene aplicada una migración de inventario pendiente. Ejecuta las migraciones nuevas en Supabase, recarga la página y vuelve a intentar.";
  }

  if (detail.includes("solo la responsable")) {
    return "Solo la responsable que abrio este turno puede cerrarlo.";
  }

  if (detail.includes("ya esta cerrado")) {
    return "Este turno de inventario ya esta cerrado.";
  }

  if (message) return message;

  return "No pudimos guardar el registro. Revisa los datos e intenta nuevamente.";
}
