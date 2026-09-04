import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";

import { DeleteActions, DeletedStatusNote } from "../../components/admin/DeleteActions";
import { InventorySimpleOrdersPanel } from "../../components/admin/InventorySimpleOrdersPanel";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { canSoftDelete, hardDeleteRecord, isSoftDeleted, restoreRecord, softDeleteRecord, type DeletableTable, type DeletionMetadata } from "../../services/adminDeletionService";
import { recordClinicalInventoryUsage } from "../../services/clinicalHistoryService";
import {
  cancelInventoryShift,
  closeInventoryShift,
  confirmInventoryShiftOpening,
  createInventoryCategory,
  createInventoryItem,
  createInventoryLot,
  createInventorySupplier,
  createInventoryUnit,
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
  recordInventoryMovement,
  updateInventoryItem,
  updateInventoryShiftClosingLine,
  updateInventoryShiftOpeningLine,
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
import { getPatients, type PatientRow } from "../../services/patientService";
import { downloadCsv } from "../../utils/csv";
import { formatDate } from "../../utils/text";

type TabKey = "turno" | "inventario" | "pedidos" | "reportes";
type MovementMode = "entrada" | "salida" | "paciente" | "merma";
type ReportPeriod = "day" | "week" | "month";
type InventoryFilter = "all" | "low" | "expired" | "duplicates" | "deleted";
type QuantityMode = "base" | "presentation";
type CountDetail = { usePresentation: boolean; full: string; loose: string; note: string };
type ShiftReadOnlyView = "products" | "consumption" | "differences";

type ItemForm = {
  id: string | null;
  name: string;
  category_id: string;
  unit_id: string;
  presentation_unit_id: string;
  units_per_presentation: number;
  minimum_stock: number;
  reference_cost: number;
  supplier_id: string;
  notes: string;
};

type MovementForm = {
  mode: MovementMode;
  quantity_mode: QuantityMode;
  item_id: string;
  quantity: number;
  lot_id: string;
  patient_id: string;
  supplier_id: string;
  lot_number: string;
  expiration_date: string;
  movement_date: string;
  notes: string;
};

type SupplierForm = {
  name: string;
  contact_name: string;
  whatsapp_phone: string;
  allows_consignment: boolean;
  notes: string;
};

const tabs: Array<{ key: TabKey; label: string; icon: ReactNode }> = [
  { key: "turno", label: "Turno", icon: <ClipboardCheck className="h-4 w-4" /> },
  { key: "inventario", label: "Inventario", icon: <Boxes className="h-4 w-4" /> },
  { key: "pedidos", label: "Pedidos", icon: <ShoppingCart className="h-4 w-4" /> },
  { key: "reportes", label: "Reportes", icon: <BarChart3 className="h-4 w-4" /> },
];

const emptyMovementForm = (mode: MovementMode): MovementForm => ({
  mode,
  quantity_mode: mode === "entrada" ? "presentation" : "base",
  item_id: "",
  quantity: 1,
  lot_id: "",
  patient_id: "",
  supplier_id: "",
  lot_number: "",
  expiration_date: "",
  movement_date: localDateTimeValue(),
  notes: "",
});

const emptySupplierForm: SupplierForm = {
  name: "",
  contact_name: "",
  whatsapp_phone: "",
  allows_consignment: false,
  notes: "",
};

export function InventorySimpleAdminPage() {
  const { role, profile, user } = useAuth();
  const actorId = profile?.id ?? user?.id ?? null;
  const [activeTab, setActiveTab] = useState<TabKey>("turno");
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
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter>("all");
  const [showItemModal, setShowItemModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(() => emptyItemForm());
  const [movementForm, setMovementForm] = useState<MovementForm>(() => emptyMovementForm("entrada"));
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplierForm);
  const [shiftDrafts, setShiftDrafts] = useState<Record<string, Record<string, string>>>({});
  const [shiftCountDetails, setShiftCountDetails] = useState<Record<string, Record<string, CountDetail>>>({});
  const [shiftSearch, setShiftSearch] = useState<Record<string, string>>({});
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("day");
  const includeDeletedInventory = role === "superadmin";
  const actorName = profile?.full_name ?? user?.email ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [itemRows, categoryRows, unitRows, supplierRows, locationRows, lotRows, movementRows, usageRows, countRows, lineRows, patientRows] = await Promise.all([
        getInventoryItems(includeDeletedInventory),
        getInventoryCategories(includeDeletedInventory),
        getInventoryUnits(includeDeletedInventory),
        getInventorySuppliers(false),
        getInventoryLocations(false),
        getInventoryLots(false),
        getInventoryMovements(false),
        getInventoryClinicalUsages(false),
        getInventoryCounts(includeDeletedInventory),
        getInventoryCountLines(),
        getPatients(false, role),
      ]);
      setItems(itemRows.filter((row) => row.is_active));
      setCategories(categoryRows.filter((row) => row.is_active));
      setUnits(unitRows.filter((row) => row.is_active));
      setSuppliers(supplierRows.filter((row) => row.is_active));
      setLocations(locationRows.filter((row) => row.is_active));
      setLots(lotRows.filter((row) => row.is_active));
      setMovements(movementRows);
      setClinicalUsages(usageRows);
      setCounts(countRows);
      setCountLines(lineRows);
      setPatients(patientRows.filter((row) => !row.is_deleted));
    } catch (error) {
      console.error("Error cargando inventario simple", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [includeDeletedInventory, role]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const itemMap = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);
  const unitMap = useMemo(() => new Map(units.map((row) => [row.id, row])), [units]);
  const activeItems = useMemo(() => items.filter((row) => !isSoftDeleted(row)), [items]);
  const archivedItems = useMemo(() => items.filter((row) => isSoftDeleted(row)), [items]);
  const activeCategories = useMemo(() => categories.filter((row) => row.is_active && !isSoftDeleted(row)), [categories]);
  const activeUnits = useMemo(() => units.filter((row) => row.is_active && !isSoftDeleted(row)), [units]);
  const archivedCategories = useMemo(() => categories.filter((row) => isSoftDeleted(row)), [categories]);
  const archivedUnits = useMemo(() => units.filter((row) => isSoftDeleted(row)), [units]);
  const openShifts = counts.filter((row) => row.status === "abierto" && !isSoftDeleted(row));
  const closedShifts = counts.filter((row) => row.status === "cerrado" && !isSoftDeleted(row));
  const archivedShifts = counts.filter((row) => row.status === "cerrado" && isSoftDeleted(row));
  const openShiftIds = useMemo(() => new Set(openShifts.map((shift) => shift.id)), [openShifts]);
  const itemIdsInOpenShifts = useMemo(() => new Set(countLines.filter((line) => openShiftIds.has(line.count_id)).map((line) => line.item_id)), [countLines, openShiftIds]);
  const lowStockItems = activeItems.filter((row) => Number(row.current_stock) <= Number(row.minimum_stock));
  const expiredItems = activeItems.filter((row) => row.expiration_date && row.expiration_date < localDateValue());
  const expiredLots = lots.filter((row) => row.expiration_date && row.expiration_date < localDateValue() && Number(row.current_quantity) > 0);
  const duplicateNames = useMemo(() => findDuplicateNames(activeItems), [activeItems]);
  const duplicateNameKeys = useMemo(() => {
    const countsByName = new Map<string, number>();
    activeItems.forEach((item) => countsByName.set(normalizeName(item.name), (countsByName.get(normalizeName(item.name)) ?? 0) + 1));
    return new Set(Array.from(countsByName.entries()).filter(([, count]) => count > 1).map(([name]) => name));
  }, [activeItems]);
  const expiredItemIds = useMemo(() => new Set([
    ...expiredItems.map((item) => item.id),
    ...expiredLots.map((lot) => lot.item_id),
  ]), [expiredItems, expiredLots]);
  const expiredInventoryItems = activeItems.filter((item) => expiredItemIds.has(item.id));
  const clinicalMovementIds = useMemo(
    () => new Set(clinicalUsages.map((row) => row.inventory_movement_id).filter((id): id is string => Boolean(id))),
    [clinicalUsages]
  );
  const filteredItems = useMemo(() => {
    const normalized = normalizeName(query);
    return items.filter((row) => {
      const deleted = isSoftDeleted(row);
      if (inventoryFilter === "deleted" && !deleted) return false;
      if (inventoryFilter !== "deleted" && deleted) return false;
      const matchesMetric = inventoryFilter === "all"
        || (inventoryFilter === "low" && Number(row.current_stock) <= Number(row.minimum_stock))
        || (inventoryFilter === "expired" && expiredItemIds.has(row.id))
        || (inventoryFilter === "duplicates" && duplicateNameKeys.has(normalizeName(row.name)))
        || inventoryFilter === "deleted";
      const matchesQuery = !normalized || normalizeName(`${row.name} ${row.sku ?? ""}`).includes(normalized);
      return matchesMetric && matchesQuery;
    });
  }, [duplicateNameKeys, expiredItemIds, inventoryFilter, items, query]);
  const itemNameSuggestions = useMemo(() => {
    const normalized = normalizeName(itemForm.name);
    if (normalized.length < 2 || itemForm.id) return [];
    return items.filter((row) => normalizeName(row.name).includes(normalized)).slice(0, 5);
  }, [itemForm.id, itemForm.name, items]);
  const reportRange = useMemo(() => getPeriodRange(reportPeriod), [reportPeriod]);
  const reportMovements = movements.filter((row) => !clinicalMovementIds.has(row.id) && isWithinRange(row.movement_date, reportRange));
  const reportUsages = clinicalUsages.filter((row) => isWithinRange(row.created_at, reportRange));
  const reportCountLines = countLines.filter((line) => {
    const count = counts.find((row) => row.id === line.count_id);
    return count?.status === "cerrado" && isWithinRange(count.closed_at ?? count.count_date, reportRange);
  });

  const createQuickCategory = async (rawName: string) => {
    const name = cleanName(rawName);
    if (!name) throw new Error("Escribe la categoría.");
    const existing = activeCategories.find((row) => sameNormalized(row.name, name));
    if (existing) return existing.id;

    const created = await createInventoryCategory({
      name,
      description: null,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    });
    setCategories((current) => sortByName(mergeById(current, created)));
    return created.id;
  };

  const createQuickUnit = async (rawName: string, preferredType?: InventoryUnitRow["unit_type"]) => {
    const name = cleanName(rawName);
    if (!name) throw new Error("Escribe la unidad.");
    const abbreviation = unitAbbreviationFromName(name);
    const existing = activeUnits.find((row) => sameNormalized(row.name, name) || sameNormalized(row.abbreviation, name) || sameNormalized(row.abbreviation, abbreviation));
    if (existing) return existing.id;

    const unitType = preferredType ?? inferUnitType(name);
    const created = await createInventoryUnit({
      name,
      abbreviation,
      unit_type: unitType,
      is_base_unit: unitType !== "empaque",
      base_unit_id: null,
      conversion_factor: 1,
      is_active: true,
      created_by: actorId,
      updated_by: actorId,
    });
    setUnits((current) => sortByName(mergeById(current, created)));
    return created.id;
  };

  const openItemModal = (item?: InventoryItemRow) => {
    setNotice(null);
    setItemForm(item ? itemToSimpleForm(item) : emptyItemForm(units[0]?.id ?? ""));
    setShowItemModal(true);
  };

  const openMovement = (mode: MovementMode, itemId = "") => {
    if (openShifts.some((shift) => !shift.opening_count_completed_at)) {
      setActiveTab("turno");
      setNotice({ type: "error", text: "Primero termina y confirma el conteo físico de apertura." });
      return;
    }
    setNotice(null);
    const selectedItem = itemMap.get(itemId);
    if (selectedItem && isSoftDeleted(selectedItem)) {
      setNotice({ type: "error", text: "Este producto está archivado. Recupéralo antes de usarlo en movimientos." });
      return;
    }
    const usesPresentation = Boolean(selectedItem?.presentation_unit_id) && Number(selectedItem?.units_per_presentation) > 1;
    setMovementForm({ ...emptyMovementForm(mode), item_id: itemId, quantity_mode: mode === "entrada" && usesPresentation ? "presentation" : "base" });
    setShowMovementModal(true);
  };

  const saveItem = async () => {
    const name = cleanName(itemForm.name);
    if (!name) return setNotice({ type: "error", text: "Escribe el nombre del producto." });
    const duplicate = items.find((row) => row.id !== itemForm.id && normalizeName(row.name) === normalizeName(name));
    if (duplicate) {
      setQuery(duplicate.name);
      setNotice({ type: "error", text: `“${duplicate.name}” ya existe. Usa ese producto para no duplicar el inventario.` });
      return;
    }
    if (!itemForm.unit_id) return setNotice({ type: "error", text: "Selecciona cómo se contará el producto." });
    if (itemForm.presentation_unit_id && itemForm.presentation_unit_id === itemForm.unit_id) {
      return setNotice({ type: "error", text: "La presentación debe ser distinta a la unidad interna. Si no aplica, déjala vacía." });
    }

    setSaving(true);
    setNotice(null);
    try {
      const unit = unitMap.get(itemForm.unit_id);
      const category = activeCategories.find((row) => row.id === itemForm.category_id);
      const payload = {
        name,
        item_type: "insumo",
        category_id: itemForm.category_id || null,
        category: category?.name ?? "General",
        unit_id: itemForm.unit_id,
        unit: unit?.abbreviation ?? "u",
        presentation_unit_id: itemForm.presentation_unit_id || null,
        units_per_presentation: itemForm.presentation_unit_id ? Math.max(Number(itemForm.units_per_presentation) || 1, 1) : 1,
        minimum_stock: Math.max(Number(itemForm.minimum_stock) || 0, 0),
        reference_cost: Number(itemForm.reference_cost) > 0 ? Number(itemForm.reference_cost) : null,
        supplier_id: itemForm.supplier_id || null,
        notes: itemForm.notes.trim() || null,
        is_active: true,
        updated_by: actorId,
      };
      if (itemForm.id) await updateInventoryItem(itemForm.id, payload);
      else await createInventoryItem({ ...payload, current_stock: 0, alert_days_before_expiration: 30, created_by: actorId });
      setShowItemModal(false);
      setNotice({ type: "success", text: itemForm.id ? "Producto actualizado." : "Producto creado. Ahora puedes registrar su primera entrada." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const saveMovement = async () => {
    const item = itemMap.get(movementForm.item_id);
    if (!item) return setNotice({ type: "error", text: "Selecciona un producto." });
    if (!Number.isFinite(Number(movementForm.quantity)) || Number(movementForm.quantity) <= 0) {
      return setNotice({ type: "error", text: "La cantidad debe ser mayor a cero." });
    }
    if (movementForm.mode === "paciente" && !movementForm.patient_id) {
      return setNotice({ type: "error", text: "Selecciona el paciente al que se descontará el producto." });
    }
    if (movementForm.expiration_date && !movementForm.lot_number.trim()) {
      return setNotice({ type: "error", text: "Si registras vencimiento, escribe también el número de lote." });
    }

    const usesPresentation = Boolean(item.presentation_unit_id) && Number(item.units_per_presentation) > 1;
    const baseQuantity = movementForm.quantity_mode === "presentation" && usesPresentation
      ? Number(movementForm.quantity) * Number(item.units_per_presentation)
      : Number(movementForm.quantity);

    setSaving(true);
    setNotice(null);
    try {
      let lotId = movementForm.lot_id || null;
      if (movementForm.mode === "entrada" && movementForm.lot_number.trim()) {
        const normalizedLot = normalizeName(movementForm.lot_number);
        const existingLot = lots.find((row) => row.item_id === item.id && normalizeName(row.lot_number) === normalizedLot);
        if (existingLot) {
          lotId = existingLot.id;
        } else {
          const createdLot = await createInventoryLot({
            item_id: item.id,
            lot_number: cleanName(movementForm.lot_number),
            supplier_id: movementForm.supplier_id || item.supplier_id || null,
            location_id: item.location_id ?? null,
            presentation_unit_id: item.presentation_unit_id ?? null,
            units_per_presentation: Number(item.units_per_presentation ?? 1),
            received_date: movementForm.movement_date.slice(0, 10),
            expiration_date: movementForm.expiration_date || null,
            initial_quantity: 0,
            current_quantity: 0,
            unit_cost: item.reference_cost,
            notes: movementForm.notes.trim() || null,
            is_active: true,
            created_by: actorId,
            updated_by: actorId,
          });
          lotId = createdLot.id;
        }
      }

      if (movementForm.mode === "paciente") {
        await recordClinicalInventoryUsage({
          patientId: movementForm.patient_id,
          itemId: item.id,
          quantity: baseQuantity,
          lotId,
          unitLabel: unitLabel(item, unitMap),
          notes: movementForm.notes.trim() || `Uso de ${item.name}`,
        });
      } else {
        await recordInventoryMovement({
          itemId: item.id,
          movementType: movementForm.mode,
          quantity: baseQuantity,
          lotId,
          supplierId: movementForm.mode === "entrada" ? movementForm.supplier_id || item.supplier_id || null : null,
          toLocationId: movementForm.mode === "entrada" ? item.location_id : null,
          reference: movementReference(movementForm.mode),
          reason: movementForm.notes.trim() || movementReference(movementForm.mode),
          movementDate: new Date(movementForm.movement_date).toISOString(),
        });
      }

      setShowMovementModal(false);
      setNotice({ type: "success", text: movementSuccessText(movementForm.mode, item.name, baseQuantity, unitLabel(item, unitMap)) });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const saveSupplier = async () => {
    const name = cleanName(supplierForm.name);
    if (!name) return setNotice({ type: "error", text: "Escribe el nombre del proveedor." });
    if (suppliers.some((row) => normalizeName(row.name) === normalizeName(name))) {
      return setNotice({ type: "error", text: "Ese proveedor ya está registrado." });
    }
    setSaving(true);
    try {
      await createInventorySupplier({
        name,
        contact_name: supplierForm.contact_name.trim() || null,
        whatsapp_phone: supplierForm.whatsapp_phone.trim() || null,
        allows_consignment: supplierForm.allows_consignment,
        notes: supplierForm.notes.trim() || null,
        payment_terms_days: 0,
        is_active: true,
        created_by: actorId,
        updated_by: actorId,
      });
      setShowSupplierModal(false);
      setSupplierForm(emptySupplierForm);
      setNotice({ type: "success", text: "Proveedor guardado." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const createShift = async () => {
    if (openShifts.length > 0) {
      setNotice({ type: "error", text: "Ya existe un turno abierto. Ciérralo o cancélalo antes de abrir otro." });
      return;
    }
    setSaving(true);
    try {
      const responsible = profile?.full_name?.trim() || profile?.email || user?.email || "Personal autorizado";
      await openInventoryShift({ shiftName: `Turno de ${responsible}`, notes: `Responsable: ${responsible}`, countDate: localDateValue() });
      setNotice({ type: "success", text: `Turno abierto por ${responsible}. Ahora registra el conteo físico de apertura.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const confirmShiftOpening = async (shift: InventoryCountRow) => {
    const lines = countLines.filter((line) => line.count_id === shift.id && itemMap.has(line.item_id));
    const draft = shiftDrafts[shift.id] ?? {};
    const details = shiftCountDetails[shift.id] ?? {};
    const valueForLine = (line: InventoryCountLineRow) => getCountDraftValue(draft, line, true);
    const countedLines = lines.filter((line) => valueForLine(line).trim() !== "");
    if (countedLines.some((line) => Number(valueForLine(line)) < 0 || !Number.isFinite(Number(valueForLine(line))))) {
      setNotice({ type: "error", text: "Revisa las cantidades: no pueden ser negativas." });
      return;
    }
    const differences = countedLines.filter((line) => Number(valueForLine(line)) !== Number(line.opening_stock)).length;
    const assumedEquals = lines.length - countedLines.length;
    if (!window.confirm(`Confirmar apertura con ${countedLines.length} producto(s) contado(s)${differences ? ` y ${differences} diferencia(s)` : ""}. ${assumedEquals > 0 ? `${assumedEquals} producto(s) no contados se tomarán como iguales al sistema.` : "Todo fue contado."}`)) return;

    setSaving(true);
    setNotice(null);
    try {
      await Promise.all(countedLines.map((line) => {
        const detail = details[line.id] ?? getPersistedCountDetail(line, true);
        return updateInventoryShiftOpeningLine({
          countId: shift.id,
          itemId: line.item_id,
          countedStock: Number(valueForLine(line)),
          fullPresentations: detail?.usePresentation ? Number(detail.full || 0) : null,
          looseUnits: detail?.usePresentation ? Number(detail.loose || 0) : null,
          notes: detail?.note.trim() || line.opening_notes || null,
        });
      }));
      await confirmInventoryShiftOpening({ countId: shift.id });
      setShiftDrafts((current) => ({ ...current, [shift.id]: {} }));
      setShiftCountDetails((current) => ({ ...current, [shift.id]: {} }));
      setNotice({ type: "success", text: "Apertura confirmada. Las diferencias quedaron registradas con su aclaración." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const closeShift = async (shift: InventoryCountRow) => {
    const lines = countLines.filter((line) => line.count_id === shift.id && itemMap.has(line.item_id));
    const draft = shiftDrafts[shift.id] ?? {};
    const details = shiftCountDetails[shift.id] ?? {};
    const valueForLine = (line: InventoryCountLineRow) => getCountDraftValue(draft, line, false);
    const countedLines = lines.filter((line) => valueForLine(line).trim() !== "");
    if (countedLines.some((line) => Number(valueForLine(line)) < 0 || !Number.isFinite(Number(valueForLine(line))))) {
      setNotice({ type: "error", text: "Revisa las cantidades: no pueden ser negativas." });
      return;
    }
    const differences = countedLines.filter((line) => {
      const item = itemMap.get(line.item_id);
      return item && Number(valueForLine(line)) !== Number(item.current_stock);
    }).length;
    const assumedEquals = lines.length - countedLines.length;
    if (!window.confirm(`Cerrar turno con ${countedLines.length} producto(s) contado(s)${differences ? ` y ${differences} diferencia(s)` : ""}. ${assumedEquals > 0 ? `${assumedEquals} producto(s) no contados se tomarán como iguales al stock actual.` : "Todo fue contado."}`)) return;

    setSaving(true);
    setNotice(null);
    try {
      await Promise.all(countedLines.map((line) => {
        const detail = details[line.id] ?? getPersistedCountDetail(line, false);
        return updateInventoryShiftClosingLine({
          countId: shift.id,
          itemId: line.item_id,
          countedStock: Number(valueForLine(line)),
          fullPresentations: detail?.usePresentation ? Number(detail.full || 0) : null,
          looseUnits: detail?.usePresentation ? Number(detail.loose || 0) : null,
          notes: detail?.note.trim() || line.notes || null,
        });
      }));
      await closeInventoryShift({ countId: shift.id, notes: "Conteo físico completado desde inventario simple" });
      setNotice({ type: "success", text: "Turno cerrado y stock actualizado." });
      setShiftDrafts((current) => ({ ...current, [shift.id]: {} }));
      setShiftCountDetails((current) => ({ ...current, [shift.id]: {} }));
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const cancelShift = async (shift: InventoryCountRow) => {
    if (!window.confirm("¿Cancelar este turno y quitarlo de la vista? Si la apertura ya fue confirmada, se revertirán sus diferencias antes de archivarlo.")) return;
    setSaving(true);
    try {
      await cancelInventoryShift({ countId: shift.id, notes: "Cancelado desde inventario simple" });
      setNotice({ type: "success", text: "Turno cancelado y archivado. Si tenía apertura confirmada, sus diferencias fueron revertidas." });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const archiveItem = async (item: InventoryItemRow) => {
    if (itemIdsInOpenShifts.has(item.id)) {
      setNotice({ type: "error", text: `Cierra o cancela el turno abierto antes de archivar “${item.name}”.` });
      setActiveTab("turno");
      return;
    }
    if (!window.confirm(`Quitar “${item.name}” de la vista del inventario? No se borra su historial.`)) return;
    setSaving(true);
    try {
      await softDeleteRecord({ table: "inventory_items", id: item.id, actorId, actorRole: role, actorName, actorEmail });
      setNotice({ type: "success", text: `“${item.name}” fue archivado. El historial queda guardado.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const restoreItem = async (item: InventoryItemRow) => {
    setSaving(true);
    try {
      await restoreRecord("inventory_items", item.id);
      setInventoryFilter("all");
      setQuery(item.name);
      setNotice({ type: "success", text: `“${item.name}” fue recuperado.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const hardDeleteItem = async (item: InventoryItemRow) => {
    if (!window.confirm(`Borrar definitivamente “${item.name}”? Esta acción solo debe usarse si no necesitas conservar este registro.`)) return;
    setSaving(true);
    try {
      await hardDeleteRecord("inventory_items", item.id);
      setNotice({ type: "success", text: `“${item.name}” fue borrado definitivamente.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const archiveInventoryRecord = async (table: DeletableTable, id: string, label: string) => {
    if (!window.confirm(`Quitar “${label}” de la vista? No se borra su historial.`)) return;
    setSaving(true);
    try {
      await softDeleteRecord({ table, id, actorId, actorRole: role, actorName, actorEmail });
      setNotice({ type: "success", text: `“${label}” fue ocultado de la vista.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const restoreInventoryRecord = async (table: DeletableTable, id: string, label: string) => {
    setSaving(true);
    try {
      await restoreRecord(table, id);
      setNotice({ type: "success", text: `“${label}” fue recuperado.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const hardDeleteInventoryRecord = async (table: DeletableTable, id: string, label: string) => {
    if (!window.confirm(`Borrar definitivamente “${label}”? Esta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await hardDeleteRecord(table, id);
      setNotice({ type: "success", text: `“${label}” fue borrado definitivamente.` });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Preparando inventario..." />;
  if (loadError) return <ErrorState label="No pudimos cargar el inventario." />;

  return (
    <div className="space-y-5">
      <section className="rounded-[30px] border border-[var(--color-border)] bg-white/80 p-5 shadow-[0_16px_45px_rgba(62,42,31,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-accent-strong)]">Inventario fácil</p>
            <h1 className="font-display mt-2 text-3xl font-semibold text-[var(--color-ink)] md:text-4xl">¿Qué necesitas hacer?</h1>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <QuickAction label="Ingresar" icon={<PackagePlus className="h-4 w-4" />} onClick={() => openMovement("entrada")} primary />
            <QuickAction label="Descontar" icon={<PackageMinus className="h-4 w-4" />} onClick={() => openMovement("salida")} />
            <QuickAction label="Por paciente" icon={<UserRound className="h-4 w-4" />} onClick={() => openMovement("paciente")} />
            <QuickAction label="Nuevo producto" icon={<Plus className="h-4 w-4" />} onClick={() => openItemModal()} />
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-1 rounded-[18px] bg-[rgba(216,194,174,0.22)] p-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] px-2 py-2 text-xs font-semibold transition sm:flex-row sm:text-sm ${activeTab === tab.key ? "bg-white text-[var(--color-ink)] shadow-sm" : "text-[var(--color-copy)]"}`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>
      </section>

      {notice ? (
        <div className={`rounded-[18px] border px-4 py-3 text-sm font-semibold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </div>
      ) : null}

      {activeTab === "turno" ? (
        <TurnSection
          openShifts={openShifts}
          closedShifts={closedShifts}
          archivedShifts={archivedShifts}
          countLines={countLines}
          movements={movements}
          clinicalUsages={clinicalUsages}
          itemMap={itemMap}
          unitMap={unitMap}
          drafts={shiftDrafts}
          setDrafts={setShiftDrafts}
          details={shiftCountDetails}
          setDetails={setShiftCountDetails}
          searches={shiftSearch}
          setSearches={setShiftSearch}
          role={role}
          saving={saving}
          onOpen={createShift}
          onConfirmOpening={confirmShiftOpening}
          onClose={closeShift}
          onCancel={cancelShift}
          onArchiveShift={(shift) => void archiveInventoryRecord("inventory_counts", shift.id, shift.shift_name || "Turno")}
          onRestoreShift={(shift) => void restoreInventoryRecord("inventory_counts", shift.id, shift.shift_name || "Turno")}
          onHardDeleteShift={(shift) => void hardDeleteInventoryRecord("inventory_counts", shift.id, shift.shift_name || "Turno")}
        />
      ) : null}

      {activeTab === "inventario" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Productos" value={String(activeItems.length)} active={inventoryFilter === "all"} onClick={() => { setInventoryFilter("all"); setQuery(""); }} />
            <Metric label="Stock bajo" value={String(lowStockItems.length)} warning={lowStockItems.length > 0} active={inventoryFilter === "low"} onClick={() => { setInventoryFilter("low"); setQuery(""); }} />
            <Metric label="Vencidos" value={String(expiredInventoryItems.length)} danger={expiredInventoryItems.length > 0} active={inventoryFilter === "expired"} onClick={() => { setInventoryFilter("expired"); setQuery(""); }} />
            <Metric label="Duplicados" value={String(duplicateNames.length)} warning={duplicateNames.length > 0} active={inventoryFilter === "duplicates"} onClick={() => { setInventoryFilter("duplicates"); setQuery(""); }} />
            {role === "superadmin" ? <Metric label="Archivados" value={String(archivedItems.length)} active={inventoryFilter === "deleted"} onClick={() => { setInventoryFilter("deleted"); setQuery(""); }} /> : null}
          </div>

          {(expiredItems.length > 0 || duplicateNames.length > 0) ? (
            <section className="rounded-[22px] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Revisión pendiente</p>
                  {expiredItems.length > 0 ? <p className="mt-1">{expiredItems.length} producto(s) tienen vencimiento anterior a hoy.</p> : null}
                  {duplicateNames.length > 0 ? <p className="mt-1">Duplicados encontrados: {duplicateNames.join(", ")}.</p> : null}
                </div>
              </div>
            </section>
          ) : null}

          <SimplePanel title="Productos" action={<button onClick={() => openItemModal()} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"><Plus className="h-4 w-4" /> Nuevo</button>}>
            {inventoryFilter !== "all" ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] bg-[#efe5da] px-4 py-2.5 text-sm text-[var(--color-ink)]">
                <span>Mostrando: <strong>{inventoryFilter === "low" ? "stock bajo" : inventoryFilter === "expired" ? "productos vencidos" : inventoryFilter === "deleted" ? "productos archivados" : "nombres duplicados"}</strong></span>
                <button type="button" onClick={() => { setInventoryFilter("all"); setQuery(""); }} className="shrink-0 font-semibold underline underline-offset-2">Ver todos</button>
              </div>
            ) : null}
            <label className="flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-white px-4 py-3">
              <Search className="h-4 w-4 text-[var(--color-copy)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" className="w-full bg-transparent text-sm outline-none" />
            </label>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                const deleted = isSoftDeleted(item);
                const lockedByOpenShift = itemIdsInOpenShifts.has(item.id);
                const canDeleteFromSimpleView = !lockedByOpenShift && canSoftDelete(role);
                return (
                <article key={item.id} className={`rounded-[20px] border p-4 ${deleted ? "border-amber-200 bg-amber-50/80" : "border-[var(--color-border)] bg-[rgba(247,242,236,0.7)]"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-ink)]">{item.name}</p>
                      <p className="mt-1 text-sm text-[var(--color-copy)]">{stockLabel(item, unitMap)}</p>
                    </div>
                    {!deleted ? <button type="button" onClick={() => openItemModal(item)} aria-label={`Editar ${item.name}`} className="rounded-full border border-[var(--color-border)] bg-white p-2"><Pencil className="h-4 w-4" /></button> : null}
                  </div>
                  <DeletedStatusNote row={item} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    {deleted ? <SmallTag text="Archivado" tone="warning" /> : Number(item.current_stock) <= Number(item.minimum_stock) ? <SmallTag text="Stock bajo" tone="warning" /> : <SmallTag text="Disponible" />}
                    {!deleted && lockedByOpenShift ? <SmallTag text="En turno abierto" tone="warning" /> : null}
                    {item.expiration_date ? <SmallTag text={`Vence ${formatDate(item.expiration_date)}`} tone={item.expiration_date < localDateValue() ? "danger" : "normal"} /> : null}
                    {item.presentation_unit_id && Number(item.units_per_presentation) > 1 ? <SmallTag text={`1 ${unitMap.get(item.presentation_unit_id)?.abbreviation ?? "envase"} = ${formatNumber(item.units_per_presentation)} ${unitLabel(item, unitMap)}`} /> : null}
                  </div>
                  {!deleted ? (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <MiniButton label="Entrar" onClick={() => openMovement("entrada", item.id)} />
                      <MiniButton label="Salir" onClick={() => openMovement("salida", item.id)} />
                      <MiniButton label="Paciente" onClick={() => openMovement("paciente", item.id)} />
                    </div>
                  ) : null}
                  {canDeleteFromSimpleView || deleted ? (
                    <div className="mt-4 flex justify-end">
                      <DeleteActions role={role} row={item} compact onSoftDelete={() => void archiveItem(item)} onRestore={() => void restoreItem(item)} onHardDelete={role === "superadmin" ? () => void hardDeleteItem(item) : undefined} />
                    </div>
                  ) : lockedByOpenShift ? (
                    <p className="mt-4 rounded-[14px] bg-white/80 px-3 py-2 text-xs font-semibold text-[var(--color-copy)]">Cierra o cancela el turno para archivar este producto.</p>
                  ) : null}
                </article>
                );
              })}
              {filteredItems.length === 0 ? <EmptyState label="No encontramos productos con ese nombre." /> : null}
            </div>
          </SimplePanel>

          {canSoftDelete(role) ? (
            <QuickInventorySettingsPanel
              role={role}
              categories={[...activeCategories, ...archivedCategories]}
              units={[...activeUnits, ...archivedUnits]}
              onArchiveCategory={(category) => void archiveInventoryRecord("inventory_categories", category.id, category.name)}
              onRestoreCategory={(category) => void restoreInventoryRecord("inventory_categories", category.id, category.name)}
              onHardDeleteCategory={(category) => void hardDeleteInventoryRecord("inventory_categories", category.id, category.name)}
              onArchiveUnit={(unit) => void archiveInventoryRecord("inventory_units", unit.id, unit.name)}
              onRestoreUnit={(unit) => void restoreInventoryRecord("inventory_units", unit.id, unit.name)}
              onHardDeleteUnit={(unit) => void hardDeleteInventoryRecord("inventory_units", unit.id, unit.name)}
            />
          ) : null}

          <SimplePanel title="Últimos movimientos">
            <MovementList movements={movements.filter((row) => !clinicalMovementIds.has(row.id)).slice(0, 20)} clinicalUsages={clinicalUsages.slice(0, 10)} itemMap={itemMap} unitMap={unitMap} />
          </SimplePanel>
        </div>
      ) : null}

      {activeTab === "pedidos" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-[22px] border border-[var(--color-border)] bg-white/80 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-[var(--color-ink)]">Proveedores y pedidos</p>
              <p className="mt-1 text-sm text-[var(--color-copy)]">El proveedor es opcional en el producto. Agrégalo solamente cuando lo necesites.</p>
            </div>
            <button onClick={() => setShowSupplierModal(true)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-4 py-2 text-sm font-semibold text-white"><Truck className="h-4 w-4" /> Nuevo proveedor</button>
          </div>
          <InventorySimpleOrdersPanel
            actorId={actorId}
            suppliers={suppliers}
            items={activeItems}
            locations={locations}
            units={activeUnits}
            onInventoryRefresh={load}
            onNewSupplier={() => setShowSupplierModal(true)}
            onNotice={setNotice}
          />
        </div>
      ) : null}

      {activeTab === "reportes" ? (
        <ReportSection
          period={reportPeriod}
          onPeriodChange={setReportPeriod}
          movements={reportMovements}
          usages={reportUsages}
          countLines={reportCountLines}
          itemMap={itemMap}
          unitMap={unitMap}
          range={reportRange}
        />
      ) : null}

      {showItemModal ? (
        <Modal title={itemForm.id ? "Editar producto" : "Nuevo producto"} onClose={() => setShowItemModal(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <TextField label="Nombre / presentación" value={itemForm.name} onChange={(name) => setItemForm({ ...itemForm, name })} placeholder="Ej. Azufre botella grande" autoFocus />
              {itemNameSuggestions.length > 0 ? (
                <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-2">
                  <p className="px-2 pb-1 text-xs font-semibold text-amber-900">¿Ya existe?</p>
                  {itemNameSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setShowItemModal(false);
                        setActiveTab("inventario");
                        setQuery(item.name);
                        setNotice({ type: "success", text: `Mostrando “${item.name}”. Puedes registrar una entrada o salida sin duplicarlo.` });
                      }}
                      className="block w-full rounded-[10px] px-2 py-2 text-left text-sm font-semibold text-amber-950 hover:bg-white"
                    >
                      {item.name} · {stockLabel(item, unitMap)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <CreatableSelectField
              label="Se descuenta internamente en"
              value={itemForm.unit_id}
              onChange={(unit_id) => setItemForm({ ...itemForm, unit_id })}
              options={activeUnits.map((row) => ({ value: row.id, label: `${row.name} (${row.abbreviation})`, searchText: `${row.name} ${row.abbreviation}`, aliases: [row.name, row.abbreviation] }))}
              onCreate={(name) => createQuickUnit(name)}
              placeholder="Buscar o crear unidad"
            />
            <CreatableSelectField
              label="Categoría"
              value={itemForm.category_id}
              onChange={(category_id) => setItemForm({ ...itemForm, category_id })}
              options={activeCategories.map((row) => ({ value: row.id, label: row.name }))}
              onCreate={createQuickCategory}
              allowEmpty
              emptyLabel="Sin categoría"
              placeholder="Buscar o crear categoría"
            />
            <CreatableSelectField
              label="Presentación de este producto"
              value={itemForm.presentation_unit_id}
              onChange={(presentation_unit_id) => setItemForm({ ...itemForm, presentation_unit_id, units_per_presentation: presentation_unit_id ? itemForm.units_per_presentation : 1 })}
              options={activeUnits.map((row) => ({ value: row.id, label: `${row.name} (${row.abbreviation})`, searchText: `${row.name} ${row.abbreviation}`, aliases: [row.name, row.abbreviation] }))}
              onCreate={(name) => createQuickUnit(name, "empaque")}
              allowEmpty
              emptyLabel="Sin presentación"
              placeholder="Buscar o crear presentación"
            />
            {itemForm.presentation_unit_id ? <NumberField label={`1 ${unitMap.get(itemForm.presentation_unit_id)?.name.toLocaleLowerCase("es") ?? "presentación"} contiene`} value={itemForm.units_per_presentation} onChange={(units_per_presentation) => setItemForm({ ...itemForm, units_per_presentation })} min={0.01} /> : null}
            <NumberField label="Avisar cuando queden" value={itemForm.minimum_stock} onChange={(minimum_stock) => setItemForm({ ...itemForm, minimum_stock })} min={0} />
            <NumberField label="Costo por unidad (opcional)" value={itemForm.reference_cost} onChange={(reference_cost) => setItemForm({ ...itemForm, reference_cost })} min={0} />
            <SelectField label="Proveedor habitual (opcional)" value={itemForm.supplier_id} onChange={(supplier_id) => setItemForm({ ...itemForm, supplier_id })} options={suppliers.map((row) => ({ value: row.id, label: row.name }))} allowEmpty />
            <TextAreaField label="Nota (opcional)" value={itemForm.notes} onChange={(notes) => setItemForm({ ...itemForm, notes })} className="sm:col-span-2" />
          </div>
          <p className="mt-4 rounded-[16px] bg-[rgba(247,242,236,0.8)] px-4 py-3 text-sm text-[var(--color-copy)]">El stock no se cambia desde esta ficha. Usa Ingresar, Descontar o el cierre de turno para que quede historial.</p>
          <ModalActions saving={saving} onSave={() => void saveItem()} onCancel={() => setShowItemModal(false)} />
        </Modal>
      ) : null}

      {showMovementModal ? (
        <MovementModal
          form={movementForm}
          setForm={setMovementForm}
          items={activeItems}
          item={itemMap.get(movementForm.item_id) ?? null}
          units={unitMap}
          suppliers={suppliers}
          lots={lots}
          patients={patients}
          saving={saving}
          onSave={() => void saveMovement()}
          onClose={() => setShowMovementModal(false)}
        />
      ) : null}

      {showSupplierModal ? (
        <Modal title="Nuevo proveedor" onClose={() => setShowSupplierModal(false)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Proveedor" value={supplierForm.name} onChange={(name) => setSupplierForm({ ...supplierForm, name })} autoFocus />
            <TextField label="Persona de contacto" value={supplierForm.contact_name} onChange={(contact_name) => setSupplierForm({ ...supplierForm, contact_name })} />
            <TextField label="WhatsApp" value={supplierForm.whatsapp_phone} onChange={(whatsapp_phone) => setSupplierForm({ ...supplierForm, whatsapp_phone })} />
            <label className="flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-white px-4 py-3 text-sm font-semibold">
              <input type="checkbox" checked={supplierForm.allows_consignment} onChange={(event) => setSupplierForm({ ...supplierForm, allows_consignment: event.target.checked })} />
              Trabaja a consignación
            </label>
            <TextAreaField label="Nota" value={supplierForm.notes} onChange={(notes) => setSupplierForm({ ...supplierForm, notes })} className="sm:col-span-2" />
          </div>
          <ModalActions saving={saving} onSave={() => void saveSupplier()} onCancel={() => setShowSupplierModal(false)} />
        </Modal>
      ) : null}
    </div>
  );
}

function TurnSection({
  openShifts,
  closedShifts,
  archivedShifts,
  countLines,
  movements,
  clinicalUsages,
  itemMap,
  unitMap,
  drafts,
  setDrafts,
  details,
  setDetails,
  searches,
  setSearches,
  role,
  saving,
  onOpen,
  onConfirmOpening,
  onClose,
  onCancel,
  onArchiveShift,
  onRestoreShift,
  onHardDeleteShift,
}: {
  openShifts: InventoryCountRow[];
  closedShifts: InventoryCountRow[];
  archivedShifts: InventoryCountRow[];
  countLines: InventoryCountLineRow[];
  movements: InventoryMovementRow[];
  clinicalUsages: InventoryClinicalUsageRow[];
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
  drafts: Record<string, Record<string, string>>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  details: Record<string, Record<string, CountDetail>>;
  setDetails: React.Dispatch<React.SetStateAction<Record<string, Record<string, CountDetail>>>>;
  searches: Record<string, string>;
  setSearches: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  role: ReturnType<typeof useAuth>["role"];
  saving: boolean;
  onOpen: () => Promise<void>;
  onConfirmOpening: (shift: InventoryCountRow) => Promise<void>;
  onClose: (shift: InventoryCountRow) => Promise<void>;
  onCancel: (shift: InventoryCountRow) => Promise<void>;
  onArchiveShift: (shift: InventoryCountRow) => void;
  onRestoreShift: (shift: InventoryCountRow) => void;
  onHardDeleteShift: (shift: InventoryCountRow) => void;
}) {
  const [focusedLineByShift, setFocusedLineByShift] = useState<Record<string, string>>({});
  const [showAllByShift, setShowAllByShift] = useState<Record<string, boolean>>({});
  const [viewingShiftId, setViewingShiftId] = useState<string | null>(null);
  const usageScoreByItem = useMemo(() => buildInventoryUsageScore(movements, clinicalUsages), [movements, clinicalUsages]);
  const previousShifts = useMemo(() => [...closedShifts, ...archivedShifts], [archivedShifts, closedShifts]);
  const viewingShift = useMemo(() => previousShifts.find((shift) => shift.id === viewingShiftId) ?? null, [previousShifts, viewingShiftId]);
  const viewingLines = useMemo(
    () => viewingShift ? countLines.filter((line) => line.count_id === viewingShift.id && itemMap.has(line.item_id)) : [],
    [countLines, itemMap, viewingShift]
  );

  return (
    <div className="space-y-5">
      {openShifts.length === 0 ? (
        <section className="rounded-[28px] border border-[var(--color-border)] bg-white/80 p-6 text-center shadow-[0_14px_40px_rgba(62,42,31,0.06)]">
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
          <h2 className="font-display mt-3 text-2xl font-semibold text-[var(--color-ink)]">No hay un turno abierto</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--color-copy)]">Al abrir se tomará automáticamente tu nombre y registrarás el conteo físico inicial.</p>
          <button onClick={() => void onOpen()} disabled={saving} className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><ClipboardCheck className="h-4 w-4" /> {saving ? "Abriendo..." : "Abrir turno"}</button>
        </section>
      ) : null}

      {openShifts.length > 1 ? (
        <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">Hay {openShifts.length} turnos antiguos abiertos. Cancela los que ya no correspondan; si ya tenían apertura confirmada, se revierte antes de archivarlos.</div>
      ) : null}

      {openShifts.map((shift) => {
        const lines = countLines
          .filter((line) => line.count_id === shift.id && itemMap.has(line.item_id))
          .sort((a, b) => (itemMap.get(a.item_id)?.name ?? "").localeCompare(itemMap.get(b.item_id)?.name ?? ""));
        const draft = drafts[shift.id] ?? {};
        const detailDraft = details[shift.id] ?? {};
        const isOpening = !shift.opening_count_completed_at;
        const valueForLine = (line: InventoryCountLineRow) => getCountDraftValue(draft, line, isOpening);
        const completed = lines.filter((line) => valueForLine(line).trim() !== "").length;
        const missingCount = Math.max(lines.length - completed, 0);
        const stale = shift.count_date < localDateValue();
        const rawSearch = searches[shift.id] ?? "";
        const search = normalizeName(rawSearch);
        const searchMatches = search ? lines.filter((line) => countLineMatchesSearch(line, itemMap, unitMap, search)) : [];
        const focusedLineId = focusedLineByShift[shift.id];
        const focusedLine = lines.find((line) => line.id === focusedLineId);
        const pendingLines = lines.filter((line) => valueForLine(line).trim() === "");
        const countedLines = lines.filter((line) => valueForLine(line).trim() !== "");
        const showAll = Boolean(showAllByShift[shift.id]);
        const suggestedPendingLines = sortCountLinesByUse(pendingLines, itemMap, usageScoreByItem).slice(0, 5);
        const suggestedCountedLines = sortCountLinesByUse(countedLines, itemMap, usageScoreByItem).slice(0, 5);
        const quickLines = suggestedPendingLines.length > 0 ? suggestedPendingLines : suggestedCountedLines;
        const visibleLines = focusedLine
          ? [focusedLine]
          : search
            ? searchMatches
            : showAll
              ? pendingLines.length > 0 ? pendingLines : countedLines
              : quickLines;
        const countedText = focusedLine
          ? "Producto seleccionado"
          : search
            ? `${searchMatches.length} coincidencia${searchMatches.length === 1 ? "" : "s"}`
            : showAll
              ? `Mostrando ${visibleLines.length} de ${pendingLines.length || countedLines.length} producto${(pendingLines.length || countedLines.length) === 1 ? "" : "s"}`
              : pendingLines.length > 0
                ? `Mostrando ${visibleLines.length} sugerido${visibleLines.length === 1 ? "" : "s"} de ${pendingLines.length} pendiente${pendingLines.length === 1 ? "" : "s"}`
                : "Todos los productos contados";
        const canSubmit = !saving && lines.length > 0;
        const submitLabel = saving
          ? "Guardando..."
          : isOpening
            ? completed > 0 ? `Confirmar apertura (${completed} contados)` : "Confirmar apertura sin cambios"
            : completed > 0 ? `Cerrar turno (${completed} contados)` : "Cerrar turno sin cambios";
        const submitHelp = isOpening
          ? "Cuenta solo lo que revisaste. Lo no contado se tomará como igual al sistema; si sistema dice 150 y cuentas 100, registra faltante de 50 con historial."
          : "Cuenta solo lo que revisaste. Lo no contado se tomará como igual al stock actual; las diferencias se regularizan y quedan en reportes.";
        const markAllMatches = () => {
          setDrafts((current) => ({ ...current, [shift.id]: Object.fromEntries(lines.map((line) => [line.id, String(isOpening ? line.opening_stock : itemMap.get(line.item_id)?.current_stock ?? 0)])) }));
          setDetails((current) => ({ ...current, [shift.id]: {} }));
          setSearches((current) => ({ ...current, [shift.id]: "" }));
          setFocusedLineByShift((current) => {
            const next = { ...current };
            delete next[shift.id];
            return next;
          });
          setShowAllByShift((current) => ({ ...current, [shift.id]: false }));
        };
        return (
          <SimplePanel
            key={shift.id}
            title={shift.shift_name || "Turno de inventario"}
            action={<SmallTag text={stale ? "Turno antiguo" : "Turno abierto"} tone={stale ? "danger" : "warning"} />}
          >
            <div className="flex flex-col gap-3 rounded-[18px] bg-[rgba(247,242,236,0.78)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">{shift.opened_by_profile?.full_name ?? shift.shift_name ?? "Personal autorizado"}</p>
                <p className="mt-1 text-sm text-[var(--color-copy)]">{isOpening ? "Conteo de apertura" : "Conteo de cierre"}: {completed} contado{completed === 1 ? "" : "s"} · {missingCount} igual{missingCount === 1 ? "" : "es"} al sistema</p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-copy)]">{submitHelp}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={markAllMatches}
                  className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold"
                >
                  Todo coincide con el sistema
                </button>
                <button type="button" onClick={() => void onCancel(shift)} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Cancelar</button>
              </div>
            </div>

            {stale ? (
              <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Este turno pertenece a una fecha anterior. Por seguridad no se debe cerrar con valores viejos; cancélalo sin modificar stock y abre uno nuevo.</div>
            ) : (
              <>
                <div className="mt-4 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-white">
                  <label className="flex items-center gap-3 px-4 py-3">
                    <Search className="h-4 w-4 text-[var(--color-copy)]" />
                    <input
                      value={rawSearch}
                      onChange={(event) => {
                        setSearches((current) => ({ ...current, [shift.id]: event.target.value }));
                        setShowAllByShift((current) => ({ ...current, [shift.id]: false }));
                        setFocusedLineByShift((current) => {
                          const next = { ...current };
                          delete next[shift.id];
                          return next;
                        });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && searchMatches[0]) {
                          event.preventDefault();
                          const first = searchMatches[0];
                          setFocusedLineByShift((current) => ({ ...current, [shift.id]: first.id }));
                          setSearches((current) => ({ ...current, [shift.id]: itemMap.get(first.item_id)?.name ?? current[shift.id] ?? "" }));
                        }
                      }}
                      placeholder="Escribe el producto para contar"
                      className="w-full bg-transparent text-sm outline-none"
                    />
                    {rawSearch ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearches((current) => ({ ...current, [shift.id]: "" }));
                          setShowAllByShift((current) => ({ ...current, [shift.id]: false }));
                          setFocusedLineByShift((current) => {
                            const next = { ...current };
                            delete next[shift.id];
                            return next;
                          });
                        }}
                        className="rounded-full p-1 text-[var(--color-copy)] hover:bg-[#f3ebe2]"
                        aria-label="Limpiar búsqueda"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </label>
                  {rawSearch.trim() ? (
                    <div className="max-h-56 overflow-y-auto border-t border-[var(--color-border)] p-2">
                      {searchMatches.slice(0, 12).map((line) => {
                        const item = itemMap.get(line.item_id)!;
                        const isCounted = valueForLine(line).trim() !== "";
                        return (
                          <button
                            key={line.id}
                            type="button"
                            onClick={() => {
                              setFocusedLineByShift((current) => ({ ...current, [shift.id]: line.id }));
                              setSearches((current) => ({ ...current, [shift.id]: item.name }));
                            }}
                            className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left hover:bg-[#f3ebe2]"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-[var(--color-ink)]">{item.name}</span>
                              <span className="mt-0.5 block text-xs text-[var(--color-copy)]">Sistema: {formatNumber(isOpening ? line.opening_stock : item.current_stock)} {unitLabel(item, unitMap)}</span>
                            </span>
                            <SmallTag text={isCounted ? "Contado" : "Pendiente"} tone={isCounted ? "normal" : "warning"} />
                          </button>
                        );
                      })}
                      {searchMatches.length === 0 ? <p className="px-3 py-4 text-sm text-[var(--color-copy)]">No encontramos ese producto.</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--color-copy)]">
                  <span>{countedText}</span>
                  <div className="flex flex-wrap gap-2">
                    {!search && !focusedLine && pendingLines.length > quickLines.length ? (
                      <button
                        type="button"
                        onClick={() => setShowAllByShift((current) => ({ ...current, [shift.id]: !showAll }))}
                        className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-[var(--color-ink)]"
                      >
                        {showAll ? "Volver a sugeridos" : `Ver todos (${pendingLines.length})`}
                      </button>
                    ) : null}
                    {focusedLine ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearches((current) => ({ ...current, [shift.id]: "" }));
                          setShowAllByShift((current) => ({ ...current, [shift.id]: false }));
                          setFocusedLineByShift((current) => {
                            const next = { ...current };
                            delete next[shift.id];
                            return next;
                          });
                        }}
                        className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-[var(--color-ink)]"
                      >
                        Buscar otro
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="sticky top-20 z-20 mt-4 rounded-[20px] border border-[var(--color-border)] bg-[rgba(255,249,244,0.96)] p-3 shadow-[0_18px_46px_rgba(62,42,31,0.14)] backdrop-blur-xl">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-ink)]">{isOpening ? "Conteo de apertura" : "Conteo de cierre"}</p>
                      <p className="mt-1 text-xs text-[var(--color-copy)]">
                        {missingCount > 0 ? `${missingCount} producto${missingCount === 1 ? "" : "s"} quedarán como iguales si confirmas ahora.` : "Todo el conteo está completo."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void (isOpening ? onConfirmOpening(shift) : onClose(shift))}
                      disabled={!canSubmit}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {submitLabel}
                    </button>
                  </div>
                </div>
                <div className="mt-4 grid gap-2">
                  {visibleLines.map((line) => {
                    const item = itemMap.get(line.item_id)!;
                    const systemStock = Number(isOpening ? line.opening_stock : item.current_stock);
                    const countedStock = valueForLine(line);
                    const detail = detailDraft[line.id] ?? getPersistedCountDetail(line, isOpening);
                    const hasDifference = countedStock !== "" && Number(countedStock) !== systemStock;
                    return (
                      <div key={line.id} className="grid gap-3 rounded-[16px] border border-[var(--color-border)] bg-white p-3 sm:grid-cols-[minmax(180px,1fr)_minmax(280px,1.35fr)] sm:items-start">
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-copy)]">Sistema: {formatNumber(systemStock)} {unitLabel(item, unitMap)}</p>
                        </div>
                        <div className="grid gap-2">
                          <CountQuantityInput
                            item={item}
                            units={unitMap}
                            value={countedStock}
                            detail={detail}
                            onValueChange={(value) => setDrafts((current) => ({ ...current, [shift.id]: { ...(current[shift.id] ?? {}), [line.id]: value } }))}
                            onDetailChange={(next) => setDetails((current) => ({ ...current, [shift.id]: { ...(current[shift.id] ?? {}), [line.id]: next } }))}
                          />
                          {hasDifference ? (
                            <input
                              value={detail.note}
                              onChange={(event) => setDetails((current) => ({ ...current, [shift.id]: { ...(current[shift.id] ?? {}), [line.id]: { ...detail, note: event.target.value } } }))}
                              placeholder={isOpening ? "Aclaración: ej. al abrir faltaban 50 unidades" : "Aclaración: ej. uso no registrado, merma o sobrante"}
                              className="premium-input"
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {visibleLines.length === 0 ? <EmptyState label="No encontramos productos con ese nombre." /> : null}
                </div>
              </>
            )}
          </SimplePanel>
        );
      })}

      <SimplePanel title="Turnos anteriores">
        <div className="grid gap-2">
          {previousShifts.slice(0, 8).map((shift) => {
            const deleted = isSoftDeleted(shift);
            return (
            <div key={shift.id} className={`flex items-center justify-between gap-3 rounded-[16px] border px-4 py-3 ${deleted ? "border-amber-200 bg-amber-50/80" : "border-[var(--color-border)] bg-white/75"}`}>
              <div>
                <p className="font-semibold text-[var(--color-ink)]">{shift.shift_name || "Turno"}</p>
                <p className="mt-1 text-xs text-[var(--color-copy)]">{formatDate(shift.count_date)} · Solo lectura</p>
                <DeletedStatusNote row={shift} />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <SmallTag text={deleted ? "Archivado" : "Cerrado"} tone={deleted ? "warning" : "normal"} />
                <button
                  type="button"
                  onClick={() => setViewingShiftId(shift.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-ink)]"
                >
                  <Eye className="h-4 w-4" /> Ver
                </button>
                {canSoftDelete(role) || deleted ? (
                  <DeleteActions
                    role={role}
                    row={shift}
                    compact
                    onSoftDelete={() => onArchiveShift(shift)}
                    onRestore={() => onRestoreShift(shift)}
                    onHardDelete={role === "superadmin" ? () => onHardDeleteShift(shift) : undefined}
                  />
                ) : null}
              </div>
            </div>
            );
          })}
          {previousShifts.length === 0 ? <EmptyState label="Todavía no hay turnos cerrados." /> : null}
        </div>
      </SimplePanel>

      {viewingShift ? (
        <ShiftReadOnlyModal
          shift={viewingShift}
          lines={viewingLines}
          movements={movements}
          clinicalUsages={clinicalUsages}
          itemMap={itemMap}
          unitMap={unitMap}
          onClose={() => setViewingShiftId(null)}
        />
      ) : null}
    </div>
  );
}

function CountQuantityInput({ item, units, value, detail, onValueChange, onDetailChange }: {
  item: InventoryItemRow;
  units: Map<string, InventoryUnitRow>;
  value: string;
  detail: CountDetail;
  onValueChange: (value: string) => void;
  onDetailChange: (detail: CountDetail) => void;
}) {
  const factor = Number(item.units_per_presentation ?? 1);
  const canCountPresentations = Boolean(item.presentation_unit_id) && factor > 1;
  const presentation = units.get(item.presentation_unit_id ?? "")?.name.toLocaleLowerCase("es") ?? "envase";
  const base = unitLabel(item, units);

  const changeParts = (full: string, loose: string) => {
    const total = (Number(full) || 0) * factor + (Number(loose) || 0);
    onDetailChange({ ...detail, usePresentation: true, full, loose });
    onValueChange(String(total));
  };

  return (
    <div className="grid gap-2">
      {canCountPresentations ? (
        <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-copy)]">
          <input
            type="checkbox"
            checked={detail.usePresentation}
            onChange={(event) => {
              if (!event.target.checked) {
                onDetailChange({ ...detail, usePresentation: false, full: "", loose: "" });
                return;
              }
              const current = Number(value) || 0;
              const full = String(Math.floor(current / factor));
              const loose = String(Number((current % factor).toFixed(2)));
              onDetailChange({ ...detail, usePresentation: true, full, loose });
              onValueChange(String(current));
            }}
          />
          Hay {presentation}s completos o abiertos
        </label>
      ) : null}
      {canCountPresentations && detail.usePresentation ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-copy)]">{presentation}s completos
            <input type="number" min="0" step="1" value={detail.full} onChange={(event) => changeParts(event.target.value, detail.loose)} placeholder="0" className="premium-input" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--color-copy)]">Contenido restante ({base})
            <input type="number" min="0" step="0.01" value={detail.loose} onChange={(event) => changeParts(detail.full, event.target.value)} placeholder="0" className="premium-input" />
          </label>
          <p className="col-span-2 text-xs font-semibold text-emerald-800">Total físico: {formatNumber(value || 0)} {base} · 1 {presentation} = {formatNumber(factor)} {base}</p>
        </div>
      ) : (
        <input type="number" min="0" step="0.01" value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={`Cantidad contada en ${base}`} className="premium-input" />
      )}
    </div>
  );
}

function ShiftReadOnlyModal({ shift, lines, movements, clinicalUsages, itemMap, unitMap, onClose }: {
  shift: InventoryCountRow;
  lines: InventoryCountLineRow[];
  movements: InventoryMovementRow[];
  clinicalUsages: InventoryClinicalUsageRow[];
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
  onClose: () => void;
}) {
  const [activeView, setActiveView] = useState<ShiftReadOnlyView>("products");
  const sortedLines = useMemo(
    () => lines.slice().sort((a, b) => (itemMap.get(a.item_id)?.name ?? "").localeCompare(itemMap.get(b.item_id)?.name ?? "")),
    [itemMap, lines]
  );
  const shiftWindow = getShiftTimeWindow(shift);
  const movementStats = useMemo(
    () => buildShiftMovementStats(movements, clinicalUsages, shiftWindow.start, shiftWindow.end),
    [clinicalUsages, movements, shiftWindow.end, shiftWindow.start]
  );
  const lineSummaries = useMemo(() => sortedLines.map((line) => {
    const item = itemMap.get(line.item_id);
    const openingDiff = Number(line.opening_difference_stock ?? 0);
    const closingDiff = closingDifferenceForLine(line);
    const openingStock = Number(line.opening_counted_stock ?? line.opening_stock ?? 0);
    const closingStock = closingStockForLine(line);
    const stats = movementStats.get(line.item_id) ?? { entries: 0, outputs: 0, patientUsages: 0 };
    const consumed = Math.max(openingStock + stats.entries - closingStock, 0);
    return { line, item, openingDiff, closingDiff, openingStock, closingStock, stats, consumed };
  }), [itemMap, movementStats, sortedLines]);
  const openingDifferences = lineSummaries.filter((summary) => summary.openingDiff !== 0).length;
  const closingDifferences = lineSummaries.filter((summary) => summary.closingDiff !== 0).length;
  const differenceSummaries = lineSummaries.filter((summary) => summary.openingDiff !== 0 || summary.closingDiff !== 0);
  const consumptionSummaries = lineSummaries.filter((summary) => summary.consumed > 0);
  const visibleSummaries = activeView === "consumption"
    ? consumptionSummaries
    : activeView === "differences"
      ? differenceSummaries
      : lineSummaries;
  const totalConsumed = lineSummaries.reduce((total, summary) => total + summary.consumed, 0);
  const activeViewLabel = activeView === "consumption"
    ? "Productos con consumo físico"
    : activeView === "differences"
      ? "Productos con diferencias"
      : "Todos los productos del turno";
  const emptyLabel = activeView === "consumption"
    ? "No hubo consumo físico en este turno."
    : activeView === "differences"
      ? "No hubo diferencias registradas en este turno."
      : "Este turno no tiene líneas de conteo.";

  return (
    <Modal title="Turno cerrado · solo lectura" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-[18px] border border-[var(--color-border)] bg-white px-4 py-3">
          <p className="font-semibold text-[var(--color-ink)]">{shift.shift_name || "Turno de inventario"}</p>
          <p className="mt-1 text-sm text-[var(--color-copy)]">
            Apertura: {shift.opening_count_completed_at ? formatDate(shift.opening_count_completed_at) : "Sin dato"} · Cierre: {shift.closed_at ? formatDate(shift.closed_at) : "Sin dato"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-copy)]">Este registro queda bloqueado: se puede consultar, pero no modificar.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Productos" value={String(lineSummaries.length)} active={activeView === "products"} onClick={() => setActiveView("products")} />
          <Metric label="Consumo físico" value={formatNumber(totalConsumed)} active={activeView === "consumption"} onClick={() => setActiveView("consumption")} />
          <Metric label="Diferencias" value={String(openingDifferences + closingDifferences)} warning={openingDifferences + closingDifferences > 0} active={activeView === "differences"} onClick={() => setActiveView("differences")} />
        </div>

        <div className="flex flex-col gap-1 rounded-[16px] bg-[rgba(247,242,236,0.78)] px-4 py-3 text-sm text-[var(--color-copy)] sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold text-[var(--color-ink)]">{activeViewLabel}</span>
          <span>{visibleSummaries.length} de {lineSummaries.length} producto{lineSummaries.length === 1 ? "" : "s"}</span>
        </div>

        <div className="max-h-[58vh] overflow-y-auto pr-1">
          <div className="grid gap-2">
            {visibleSummaries.map(({ line, item, openingDiff, closingDiff, openingStock, closingStock, stats, consumed }) => {
              return (
                <article key={line.id} className="rounded-[16px] border border-[var(--color-border)] bg-white/80 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">{item?.name ?? "Producto"}</p>
                      <p className="mt-1 text-xs text-[var(--color-copy)]">
                        Apertura física: {formatNumber(openingStock)} {unitLabel(item, unitMap)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-copy)]">
                        Cierre físico: {formatNumber(closingStock)} {unitLabel(item, unitMap)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-copy)]">
                        Consumo neto: {formatNumber(consumed)} {unitLabel(item, unitMap)}
                        {stats.entries > 0 ? ` · entradas durante turno: ${formatNumber(stats.entries)}` : ""}
                        {stats.outputs + stats.patientUsages > 0 ? ` · salidas/uso registrado: ${formatNumber(stats.outputs + stats.patientUsages)}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SmallTag text={`Apertura ${openingDiff > 0 ? "+" : ""}${formatNumber(openingDiff)}`} tone={openingDiff === 0 ? "normal" : "warning"} />
                      <SmallTag text={`Cierre ${closingDiff > 0 ? "+" : ""}${formatNumber(closingDiff)}`} tone={closingDiff === 0 ? "normal" : "warning"} />
                    </div>
                  </div>
                  {line.opening_notes || line.closing_notes || line.notes ? (
                    <div className="mt-3 rounded-[12px] bg-[rgba(247,242,236,0.8)] px-3 py-2 text-xs leading-5 text-[var(--color-copy)]">
                      {line.opening_notes ? <p><span className="font-semibold text-[var(--color-ink)]">Nota apertura:</span> {line.opening_notes}</p> : null}
                      {line.closing_notes || line.notes ? <p><span className="font-semibold text-[var(--color-ink)]">Nota cierre:</span> {line.closing_notes ?? line.notes}</p> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {visibleSummaries.length === 0 ? <EmptyState label={emptyLabel} /> : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function MovementModal({ form, setForm, items, item, units, suppliers, lots, patients, saving, onSave, onClose }: {
  form: MovementForm;
  setForm: (form: MovementForm) => void;
  items: InventoryItemRow[];
  item: InventoryItemRow | null;
  units: Map<string, InventoryUnitRow>;
  suppliers: InventorySupplierRow[];
  lots: InventoryLotRow[];
  patients: PatientRow[];
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [productSearch, setProductSearch] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const title = { entrada: "Ingresar productos", salida: "Descontar productos", paciente: "Descontar por paciente", merma: "Registrar merma" }[form.mode];
  const usesPresentation = Boolean(item?.presentation_unit_id) && Number(item?.units_per_presentation) > 1;
  const presentationLabel = item?.presentation_unit_id ? units.get(item.presentation_unit_id)?.abbreviation ?? "envase" : unitLabel(item, units);
  const baseLabel = unitLabel(item, units);
  const baseQuantity = form.quantity_mode === "presentation" && usesPresentation ? Number(form.quantity) * Number(item?.units_per_presentation ?? 1) : Number(form.quantity);
  const itemLots = lots.filter((row) => row.item_id === item?.id && Number(row.current_quantity) > 0);
  const visibleItems = items
    .filter((row) => !productSearch.trim() || normalizeName(`${row.name} ${row.sku ?? ""}`).includes(normalizeName(productSearch)))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const visiblePatients = patients
    .filter((row) => !patientSearch.trim() || normalizeName(`${row.full_name} ${row.document_number ?? ""}`).includes(normalizeName(patientSearch)))
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2 sm:col-span-2">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Producto</p>
          {item ? (
            <div className="flex items-center justify-between gap-3 rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div><p className="font-semibold text-emerald-950">{item.name}</p><p className="mt-1 text-xs text-emerald-800">Disponible: {stockLabel(item, units)}</p></div>
              <button type="button" onClick={() => { setForm({ ...form, item_id: "", lot_id: "", quantity_mode: form.mode === "entrada" ? "presentation" : "base" }); setProductSearch(""); }} className="shrink-0 text-xs font-semibold underline underline-offset-2">Cambiar</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-white">
              <label className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
                <Search className="h-4 w-4 text-[var(--color-copy)]" />
                <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Escribe el nombre del producto" autoFocus className="w-full bg-transparent text-sm outline-none" />
              </label>
              <div className="max-h-56 overflow-y-auto p-2">
                {visibleItems.slice(0, 12).map((row) => {
                  const rowUsesPresentation = Boolean(row.presentation_unit_id) && Number(row.units_per_presentation) > 1;
                  return <button key={row.id} type="button" onClick={() => { setForm({ ...form, item_id: row.id, lot_id: "", supplier_id: row.supplier_id ?? "", quantity_mode: form.mode === "entrada" && rowUsesPresentation ? "presentation" : "base" }); setProductSearch(""); }} className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 text-left hover:bg-[#f3ebe2]"><span className="font-semibold text-[var(--color-ink)]">{row.name}</span><span className="shrink-0 text-xs text-[var(--color-copy)]">{stockLabel(row, units)}</span></button>;
                })}
                {visibleItems.length === 0 ? <p className="px-3 py-4 text-sm text-[var(--color-copy)]">No encontramos ese producto.</p> : null}
              </div>
            </div>
          )}
        </div>
        {item && usesPresentation ? (
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <button type="button" onClick={() => setForm({ ...form, quantity_mode: "presentation" })} className={`rounded-[14px] px-3 py-2 text-sm font-semibold ${form.quantity_mode === "presentation" ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white"}`}>Por {presentationLabel}</button>
            <button type="button" onClick={() => setForm({ ...form, quantity_mode: "base" })} className={`rounded-[14px] px-3 py-2 text-sm font-semibold ${form.quantity_mode === "base" ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white"}`}>Por {baseLabel}</button>
          </div>
        ) : null}
        {item ? <NumberField label={form.quantity_mode === "presentation" && usesPresentation ? `Cantidad de ${presentationLabel}` : `Cantidad en ${baseLabel}`} value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} min={0.01} /> : null}
        {item && usesPresentation ? (
          <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 sm:col-span-2">{formatNumber(form.quantity)} {form.quantity_mode === "presentation" ? presentationLabel : baseLabel} representan {formatNumber(baseQuantity)} {baseLabel}.</div>
        ) : null}
        {form.mode === "paciente" ? <TextField label="Buscar paciente" value={patientSearch} onChange={setPatientSearch} placeholder="Nombre o carnet" /> : null}
        {form.mode === "paciente" ? <SelectField label="Paciente" value={form.patient_id} onChange={(patient_id) => { setForm({ ...form, patient_id }); setPatientSearch(""); }} options={visiblePatients.map((row) => ({ value: row.id, label: `${row.full_name}${row.document_number ? ` · CI ${row.document_number}` : ""}` }))} /> : null}
        {form.mode !== "entrada" && itemLots.length > 0 ? <SelectField label="Lote (opcional)" value={form.lot_id} onChange={(lot_id) => setForm({ ...form, lot_id })} options={itemLots.map((row) => ({ value: row.id, label: `${row.lot_number} · ${formatNumber(row.current_quantity)} ${baseLabel}` }))} allowEmpty emptyLabel="Sin lote" /> : null}
        {form.mode === "entrada" ? <SelectField label="Proveedor (opcional)" value={form.supplier_id || item?.supplier_id || ""} onChange={(supplier_id) => setForm({ ...form, supplier_id })} options={suppliers.map((row) => ({ value: row.id, label: row.name }))} allowEmpty /> : null}
        {form.mode === "entrada" ? <TextField label="Lote (opcional)" value={form.lot_number} onChange={(lot_number) => setForm({ ...form, lot_number })} placeholder="Ej. L-2026-08" /> : null}
        {form.mode === "entrada" ? <DateField label="Vencimiento (opcional)" value={form.expiration_date} onChange={(expiration_date) => setForm({ ...form, expiration_date })} /> : null}
        <DateTimeField label="Fecha y hora" value={form.movement_date} onChange={(movement_date) => setForm({ ...form, movement_date })} />
        <TextAreaField label="Motivo o nota (opcional)" value={form.notes} onChange={(notes) => setForm({ ...form, notes })} className="sm:col-span-2" />
      </div>
      {item && form.mode !== "entrada" ? <p className="mt-4 rounded-[16px] bg-[rgba(247,242,236,0.8)] px-4 py-3 text-sm text-[var(--color-copy)]">Disponible: {formatNumber(item.current_stock)} {baseLabel}</p> : null}
      <ModalActions saving={saving} onSave={onSave} onCancel={onClose} saveLabel={form.mode === "entrada" ? "Registrar entrada" : "Registrar descuento"} />
    </Modal>
  );
}

function ReportSection({ period, onPeriodChange, movements, usages, countLines, itemMap, unitMap, range }: {
  period: ReportPeriod;
  onPeriodChange: (period: ReportPeriod) => void;
  movements: InventoryMovementRow[];
  usages: InventoryClinicalUsageRow[];
  countLines: InventoryCountLineRow[];
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
  range: { start: string; end: string };
}) {
  const entries = movements.filter((row) => row.movement_type === "entrada");
  const outputs = movements.filter((row) => ["salida", "merma"].includes(row.movement_type));
  const differences = countLines.filter((row) => closingDifferenceForLine(row) !== 0 || Number(row.opening_difference_stock ?? 0) !== 0);
  const exportRows = [
    ...movements.map((row) => ({ fecha: row.movement_date, tipo: row.movement_type, producto: row.item_name_snapshot, cantidad: row.quantity, unidad: row.unit_label_snapshot ?? itemMap.get(row.item_id)?.unit ?? "u", responsable: row.created_by_profile?.full_name ?? "", detalle: row.reason ?? row.reference ?? "" })),
    ...usages.map((row) => ({ fecha: row.created_at, tipo: "paciente", producto: row.inventory_items?.name ?? itemMap.get(row.item_id)?.name ?? "", cantidad: row.quantity, unidad: row.unit_label_snapshot ?? row.unit_label ?? "u", responsable: row.created_by_profile?.full_name ?? "", detalle: row.patients?.full_name ?? "" })),
    ...countLines.filter((row) => Number(row.opening_difference_stock ?? 0) !== 0).map((row) => ({ fecha: row.opening_counted_at ?? row.created_at, tipo: "diferencia_apertura", producto: itemMap.get(row.item_id)?.name ?? "Producto", cantidad: row.opening_difference_stock ?? 0, unidad: row.unit_label_snapshot ?? itemMap.get(row.item_id)?.unit ?? "u", responsable: "", detalle: row.opening_notes ?? "Sin aclaración" })),
    ...countLines.filter((row) => closingDifferenceForLine(row) !== 0).map((row) => ({ fecha: row.closing_counted_at ?? row.updated_at, tipo: "diferencia_cierre", producto: itemMap.get(row.item_id)?.name ?? "Producto", cantidad: closingDifferenceForLine(row), unidad: row.unit_label_snapshot ?? itemMap.get(row.item_id)?.unit ?? "u", responsable: row.counted_by_profile?.full_name ?? "", detalle: row.closing_notes ?? row.notes ?? "Sin aclaración" })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <div className="space-y-5">
      <SimplePanel title="Reporte de inventario" action={<button onClick={() => downloadCsv(`inventario-${range.start}-a-${range.end}.csv`, exportRows)} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold"><Download className="h-4 w-4" /> Descargar</button>}>
        <div className="grid grid-cols-3 gap-2">
          {([['day', 'Hoy'], ['week', 'Semana'], ['month', 'Mes']] as Array<[ReportPeriod, string]>).map(([key, label]) => <button key={key} onClick={() => onPeriodChange(key)} className={`rounded-[14px] px-3 py-2 text-sm font-semibold ${period === key ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white"}`}>{label}</button>)}
        </div>
        <p className="mt-3 text-sm text-[var(--color-copy)]">Del {formatDate(range.start)} al {formatDate(range.end)}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Entradas" value={String(entries.length)} />
          <Metric label="Salidas" value={String(outputs.length)} />
          <Metric label="Usos por paciente" value={String(usages.length)} />
          <Metric label="Diferencias" value={String(differences.length)} warning={differences.length > 0} />
        </div>
      </SimplePanel>
      {differences.length > 0 ? (
        <SimplePanel title="Diferencias de apertura y cierre">
          <div className="grid gap-2">
            {differences.map((row) => {
              const openingDifference = Number(row.opening_difference_stock ?? 0);
              const closingDifference = closingDifferenceForLine(row);
              return <div key={row.id} className="rounded-[16px] border border-amber-200 bg-amber-50 px-4 py-3"><p className="font-semibold text-amber-950">{itemMap.get(row.item_id)?.name ?? "Producto"}</p>{openingDifference !== 0 ? <p className="mt-1 text-sm text-amber-900">Apertura: {openingDifference > 0 ? "+" : ""}{formatNumber(openingDifference)} {row.unit_label_snapshot ?? "u"} · {row.opening_notes || "Sin aclaración"}</p> : null}{closingDifference !== 0 ? <p className="mt-1 text-sm text-amber-900">Cierre: {closingDifference > 0 ? "+" : ""}{formatNumber(closingDifference)} {row.unit_label_snapshot ?? "u"} · {row.closing_notes || row.notes || "Sin aclaración"}</p> : null}</div>;
            })}
          </div>
        </SimplePanel>
      ) : null}
      <SimplePanel title="Detalle del periodo">
        <MovementList movements={movements} clinicalUsages={usages} itemMap={itemMap} unitMap={unitMap} />
      </SimplePanel>
    </div>
  );
}

function MovementList({ movements, clinicalUsages, itemMap, unitMap }: { movements: InventoryMovementRow[]; clinicalUsages: InventoryClinicalUsageRow[]; itemMap: Map<string, InventoryItemRow>; unitMap: Map<string, InventoryUnitRow> }) {
  const rows = [
    ...movements.map((row) => ({ id: `m-${row.id}`, date: row.movement_date, title: row.item_name_snapshot, type: movementTypeLabel(row.movement_type), quantity: Number(row.quantity), unit: row.unit_label_snapshot ?? unitLabel(itemMap.get(row.item_id), unitMap), detail: row.reason ?? row.reference ?? "" })),
    ...clinicalUsages.map((row) => ({ id: `u-${row.id}`, date: row.created_at, title: row.inventory_items?.name ?? itemMap.get(row.item_id)?.name ?? "Producto", type: "Paciente", quantity: Number(row.quantity), unit: row.unit_label_snapshot ?? row.unit_label ?? unitLabel(itemMap.get(row.item_id), unitMap), detail: row.patients?.full_name ?? "Paciente" })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="grid gap-2">
      {rows.slice(0, 40).map((row) => (
        <div key={row.id} className="flex flex-col gap-2 rounded-[16px] border border-[var(--color-border)] bg-white/75 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold text-[var(--color-ink)]">{row.title}</p><p className="mt-1 text-xs text-[var(--color-copy)]">{row.type} · {formatDate(row.date)}{row.detail ? ` · ${row.detail}` : ""}</p></div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">{formatNumber(row.quantity)} {row.unit}</p>
        </div>
      ))}
      {rows.length === 0 ? <EmptyState label="No hay movimientos en este periodo." /> : null}
    </div>
  );
}

function QuickInventorySettingsPanel({
  role,
  categories,
  units,
  onArchiveCategory,
  onRestoreCategory,
  onHardDeleteCategory,
  onArchiveUnit,
  onRestoreUnit,
  onHardDeleteUnit,
}: {
  role: ReturnType<typeof useAuth>["role"];
  categories: InventoryCategoryRow[];
  units: InventoryUnitRow[];
  onArchiveCategory: (category: InventoryCategoryRow) => void;
  onRestoreCategory: (category: InventoryCategoryRow) => void;
  onHardDeleteCategory: (category: InventoryCategoryRow) => void;
  onArchiveUnit: (unit: InventoryUnitRow) => void;
  onRestoreUnit: (unit: InventoryUnitRow) => void;
  onHardDeleteUnit: (unit: InventoryUnitRow) => void;
}) {
  const sortedCategories = sortByDeletedAndName(categories);
  const sortedUnits = sortByDeletedAndName(units);

  return (
    <SimplePanel title="Configuración rápida">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Categorías</p>
          {sortedCategories.slice(0, 16).map((category) => (
            <SettingsRecordRow
              key={category.id}
              role={role}
              row={category}
              title={category.name}
              detail={category.description ?? "Sin descripción"}
              onArchive={() => onArchiveCategory(category)}
              onRestore={() => onRestoreCategory(category)}
              onHardDelete={() => onHardDeleteCategory(category)}
            />
          ))}
          {sortedCategories.length === 0 ? <EmptyState label="Sin categorías." /> : null}
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Unidades y presentaciones</p>
          {sortedUnits.slice(0, 16).map((unit) => (
            <SettingsRecordRow
              key={unit.id}
              role={role}
              row={unit}
              title={unit.name}
              detail={`${unit.abbreviation} · ${unit.unit_type}`}
              onArchive={() => onArchiveUnit(unit)}
              onRestore={() => onRestoreUnit(unit)}
              onHardDelete={() => onHardDeleteUnit(unit)}
            />
          ))}
          {sortedUnits.length === 0 ? <EmptyState label="Sin unidades." /> : null}
        </div>
      </div>
    </SimplePanel>
  );
}

function SettingsRecordRow({
  role,
  row,
  title,
  detail,
  onArchive,
  onRestore,
  onHardDelete,
}: {
  role: ReturnType<typeof useAuth>["role"];
  row: DeletionMetadata;
  title: string;
  detail: string;
  onArchive: () => void;
  onRestore: () => void;
  onHardDelete: () => void;
}) {
  const deleted = isSoftDeleted(row);

  return (
    <div className={`flex flex-col gap-3 rounded-[16px] border px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${deleted ? "border-amber-200 bg-amber-50/80" : "border-[var(--color-border)] bg-white/75"}`}>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--color-ink)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--color-copy)]">{detail}</p>
        <DeletedStatusNote row={row} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {deleted ? <SmallTag text="Archivado" tone="warning" /> : null}
        <DeleteActions
          role={role}
          row={row}
          compact
          onSoftDelete={onArchive}
          onRestore={onRestore}
          onHardDelete={role === "superadmin" ? onHardDelete : undefined}
        />
      </div>
    </div>
  );
}

function QuickAction({ label, icon, onClick, primary = false }: { label: string; icon: ReactNode; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold ${primary ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white text-[var(--color-ink)]"}`}>{icon}{label}</button>;
}

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-[var(--color-border)] bg-white px-2 py-2 text-xs font-semibold">{label}</button>;
}

function SimplePanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5 shadow-[0_12px_35px_rgba(62,42,31,0.05)]"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{title}</h2>{action}</div>{children}</section>;
}

function Metric({ label, value, warning = false, danger = false, active = false, onClick }: { label: string; value: string; warning?: boolean; danger?: boolean; active?: boolean; onClick?: () => void }) {
  const tone = danger ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : "border-[var(--color-border)] bg-white";
  return <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-mocha)] ${tone} ${active ? "ring-2 ring-[var(--color-mocha)] ring-offset-2" : ""}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-copy)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</p><p className="mt-1 text-[11px] font-semibold text-[var(--color-copy)]">Ver productos</p></button>;
}

function SmallTag({ text, tone = "normal" }: { text: string; tone?: "normal" | "warning" | "danger" }) {
  const style = tone === "danger" ? "bg-red-100 text-red-800" : tone === "warning" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>{text}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="isolate max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] border border-[#dfd2c5] bg-[#f8f3ed] p-5 shadow-[0_28px_80px_rgba(28,18,12,0.38)] sm:rounded-[28px] sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{title}</h2><button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] bg-white p-2" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>{children}</section></div>;
}

function ModalActions({ saving, onSave, onCancel, saveLabel = "Guardar" }: { saving: boolean; onSave: () => void; onCancel: () => void; saveLabel?: string }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-full border border-[var(--color-border)] bg-white px-5 py-3 text-sm font-semibold">Cancelar</button><button type="button" onClick={onSave} disabled={saving} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : saveLabel}</button></div>;
}

function TextField({ label, value, onChange, placeholder = "", autoFocus = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{label}<input autoFocus={autoFocus} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="premium-input" /></label>;
}

function TextAreaField({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (value: string) => void; className?: string }) {
  return <label className={`grid gap-1.5 text-sm font-semibold text-[var(--color-ink)] ${className}`}>{label}<textarea value={value} onChange={(event) => onChange(event.target.value)} className="premium-input min-h-24" /></label>;
}

function NumberField({ label, value, onChange, min = 0 }: { label: string; value: number; onChange: (value: number) => void; min?: number }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{label}<input type="number" min={min} step="0.01" value={String(value)} onChange={(event) => onChange(Number(event.target.value))} className="premium-input" /></label>;
}

function SelectField({ label, value, onChange, options, allowEmpty = false, emptyLabel = "Selecciona" }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; allowEmpty?: boolean; emptyLabel?: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="premium-input"><option value="">{allowEmpty ? emptyLabel : "Selecciona"}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

type CreatableOption = {
  value: string;
  label: string;
  searchText?: string;
  aliases?: string[];
};

function CreatableSelectField({
  label,
  value,
  onChange,
  options,
  onCreate,
  allowEmpty = false,
  emptyLabel = "Sin selección",
  placeholder = "Buscar o crear",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: CreatableOption[];
  onCreate?: (name: string) => Promise<string>;
  allowEmpty?: boolean;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;
  const normalizedSearch = normalizeName(search);
  const cleanSearch = cleanName(search);
  const listIsOpen = Boolean(normalizedSearch) || !selected;
  const visibleOptions = options
    .filter((option) => !normalizedSearch || normalizeName(optionSearchText(option)).includes(normalizedSearch))
    .slice(0, 8);
  const exactOption = cleanSearch ? options.find((option) => optionMatchesExactly(option, cleanSearch)) : null;
  const canCreate = Boolean(onCreate && cleanSearch && !exactOption);

  const create = async () => {
    if (!onCreate || !cleanSearch) return;
    setCreating(true);
    setError("");
    try {
      const createdId = await onCreate(cleanSearch);
      onChange(createdId);
      setSearch("");
    } catch (createError) {
      setError(friendlyError(createError));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">
      <span>{label}</span>
      <div className="rounded-[16px] border border-[var(--color-border)] bg-white p-2">
        {selected ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-[12px] bg-emerald-50 px-3 py-2 text-emerald-950">
            <span className="truncate">{selected.label}</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="rounded-full p-1 text-emerald-900 hover:bg-emerald-100"
              aria-label={`Quitar ${selected.label}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}
        <label className="flex items-center gap-2 rounded-[12px] bg-[#fbf7f2] px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-copy)]" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setError("");
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
          />
        </label>
        {listIsOpen ? (
          <div className="mt-2 max-h-48 overflow-y-auto rounded-[12px] bg-[#fbf7f2] p-1">
            {allowEmpty ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setSearch("");
                  setError("");
                }}
                className="block w-full rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-[var(--color-copy)] hover:bg-white"
              >
                {emptyLabel}
              </button>
            ) : null}
            {visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setSearch("");
                  setError("");
                }}
                className="block w-full rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-[var(--color-ink)] hover:bg-white"
              >
                {option.label}
              </button>
            ))}
            {canCreate ? (
              <button
                type="button"
                onClick={() => void create()}
                disabled={creating}
                className="mt-1 flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-emerald-800 hover:bg-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                {creating ? "Creando..." : `Crear “${cleanSearch}”`}
              </button>
            ) : null}
            {visibleOptions.length === 0 && !canCreate ? <p className="px-3 py-3 text-sm font-medium text-[var(--color-copy)]">Sin resultados.</p> : null}
          </div>
        ) : null}
        {error ? <p className="mt-2 rounded-[10px] bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">{error}</p> : null}
      </div>
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{label}<input type="date" value={value} onChange={(event) => onChange(event.target.value)} className="premium-input" /></label>;
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1.5 text-sm font-semibold text-[var(--color-ink)]">{label}<input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} className="premium-input" /></label>;
}

function emptyItemForm(unitId = ""): ItemForm {
  return { id: null, name: "", category_id: "", unit_id: unitId, presentation_unit_id: "", units_per_presentation: 1, minimum_stock: 0, reference_cost: 0, supplier_id: "", notes: "" };
}

function itemToSimpleForm(item: InventoryItemRow): ItemForm {
  return { id: item.id, name: item.name, category_id: item.category_id ?? "", unit_id: item.unit_id ?? "", presentation_unit_id: item.presentation_unit_id ?? "", units_per_presentation: Number(item.units_per_presentation ?? 1), minimum_stock: Number(item.minimum_stock ?? 0), reference_cost: Number(item.reference_cost ?? 0), supplier_id: item.supplier_id ?? "", notes: item.notes ?? "" };
}

function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function cleanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sameNormalized(left: string | null | undefined, right: string | null | undefined) {
  return normalizeName(left ?? "") === normalizeName(right ?? "");
}

function mergeById<T extends { id: string }>(rows: T[], row: T) {
  return [...rows.filter((current) => current.id !== row.id), row];
}

function sortByName<T extends { name: string }>(rows: T[]) {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function sortByDeletedAndName<T extends DeletionMetadata & { name: string }>(rows: T[]) {
  return rows.slice().sort((a, b) => {
    const deletedDifference = Number(isSoftDeleted(a)) - Number(isSoftDeleted(b));
    if (deletedDifference !== 0) return deletedDifference;
    return a.name.localeCompare(b.name);
  });
}

function optionSearchText(option: CreatableOption) {
  return [option.label, option.searchText, ...(option.aliases ?? [])].filter(Boolean).join(" ");
}

function optionMatchesExactly(option: CreatableOption, value: string) {
  return [option.label, option.searchText, ...(option.aliases ?? [])].filter(Boolean).some((candidate) => sameNormalized(candidate, value));
}

function unitAbbreviationFromName(value: string) {
  const normalized = normalizeName(value);
  const known = new Map([
    ["unidad", "u"],
    ["unidades", "u"],
    ["mililitro", "ml"],
    ["mililitros", "ml"],
    ["litro", "l"],
    ["litros", "l"],
    ["gramo", "g"],
    ["gramos", "g"],
    ["kilogramo", "kg"],
    ["kilogramos", "kg"],
  ]);
  const direct = known.get(normalized);
  if (direct) return direct;
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "u";
}

function inferUnitType(value: string): InventoryUnitRow["unit_type"] {
  const normalized = normalizeName(value);
  if (/\b(ml|mililitro|mililitros|l|lt|litro|litros)\b/.test(normalized)) return "volumen";
  if (/\b(g|gr|gramo|gramos|kg|kilogramo|kilogramos)\b/.test(normalized)) return "peso";
  if (/(ampolla|botella|caja|frasco|paquete|sachet|sobre|tubo|vial)/.test(normalized)) return "empaque";
  return "unidad";
}

function buildInventoryUsageScore(movements: InventoryMovementRow[], clinicalUsages: InventoryClinicalUsageRow[]) {
  const scores = new Map<string, number>();
  const add = (itemId: string | null | undefined, weight: number) => {
    if (!itemId) return;
    scores.set(itemId, (scores.get(itemId) ?? 0) + weight);
  };

  movements.forEach((movement) => {
    const weight = movement.movement_type === "entrada" ? 1 : movement.movement_type === "conteo" ? 0.5 : 2;
    add(movement.item_id, weight);
  });
  clinicalUsages.forEach((usage) => add(usage.item_id, 3));
  return scores;
}

function sortCountLinesByUse(lines: InventoryCountLineRow[], itemMap: Map<string, InventoryItemRow>, usageScoreByItem: Map<string, number>) {
  return lines.slice().sort((a, b) => {
    const usageDifference = (usageScoreByItem.get(b.item_id) ?? 0) - (usageScoreByItem.get(a.item_id) ?? 0);
    if (usageDifference !== 0) return usageDifference;
    return (itemMap.get(a.item_id)?.name ?? "").localeCompare(itemMap.get(b.item_id)?.name ?? "");
  });
}

function getCountDraftValue(draft: Record<string, string>, line: InventoryCountLineRow, isOpening: boolean) {
  const draftValue = draft[line.id];
  if (draftValue != null) return draftValue;

  if (isOpening) {
    return line.opening_counted_stock == null ? "" : String(line.opening_counted_stock);
  }

  return line.counted_by || line.closing_counted_by ? String(line.closing_counted_stock ?? line.counted_stock ?? "") : "";
}

function getPersistedCountDetail(line: InventoryCountLineRow, isOpening: boolean): CountDetail {
  const full = isOpening ? line.opening_full_presentations : line.closing_full_presentations;
  const loose = isOpening ? line.opening_loose_units : line.closing_loose_units;
  return {
    usePresentation: full != null || loose != null,
    full: full == null ? "" : String(full),
    loose: loose == null ? "" : String(loose),
    note: isOpening ? line.opening_notes ?? "" : line.closing_notes ?? line.notes ?? "",
  };
}

function closingStockForLine(line: InventoryCountLineRow) {
  return Number(line.closing_counted_stock ?? line.counted_stock ?? line.expected_stock ?? 0);
}

function closingDifferenceForLine(line: InventoryCountLineRow) {
  return Number(line.closing_difference_stock ?? line.difference_stock ?? 0);
}

function getShiftTimeWindow(shift: InventoryCountRow) {
  return {
    start: new Date(shift.opened_at ?? shift.created_at).getTime(),
    end: new Date(shift.closed_at ?? shift.updated_at).getTime(),
  };
}

function isInsideShiftWindow(value: string | null | undefined, start: number, end: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= start && time <= end;
}

function buildShiftMovementStats(
  movements: InventoryMovementRow[],
  clinicalUsages: InventoryClinicalUsageRow[],
  start: number,
  end: number
) {
  const stats = new Map<string, { entries: number; outputs: number; patientUsages: number }>();
  const clinicalMovementIds = new Set(
    clinicalUsages
      .filter((usage) => isInsideShiftWindow(usage.created_at, start, end))
      .map((usage) => usage.inventory_movement_id)
      .filter((id): id is string => Boolean(id))
  );
  const get = (itemId: string) => {
    const existing = stats.get(itemId);
    if (existing) return existing;
    const created = { entries: 0, outputs: 0, patientUsages: 0 };
    stats.set(itemId, created);
    return created;
  };

  movements.forEach((movement) => {
    if (!isInsideShiftWindow(movement.movement_date, start, end) || movement.movement_type === "conteo") return;
    if (clinicalMovementIds.has(movement.id)) return;
    const row = get(movement.item_id);
    if (movement.movement_type === "entrada") row.entries += Number(movement.quantity ?? 0);
    if (["salida", "merma"].includes(movement.movement_type)) row.outputs += Number(movement.quantity ?? 0);
  });

  clinicalUsages.forEach((usage) => {
    if (!isInsideShiftWindow(usage.created_at, start, end)) return;
    get(usage.item_id).patientUsages += Number(usage.quantity ?? 0);
  });

  return stats;
}

function countLineMatchesSearch(line: InventoryCountLineRow, itemMap: Map<string, InventoryItemRow>, unitMap: Map<string, InventoryUnitRow>, normalizedSearch: string) {
  const item = itemMap.get(line.item_id);
  if (!item) return false;
  const searchableText = [
    item.name,
    item.sku,
    item.barcode,
    item.category,
    item.notes,
    unitLabel(item, unitMap),
    stockLabel(item, unitMap),
  ].filter(Boolean).join(" ");
  return normalizeName(searchableText).includes(normalizedSearch);
}

function findDuplicateNames(items: InventoryItemRow[]) {
  const grouped = new Map<string, string[]>();
  items.forEach((item) => grouped.set(normalizeName(item.name), [...(grouped.get(normalizeName(item.name)) ?? []), item.name]));
  return Array.from(grouped.values()).filter((rows) => rows.length > 1).map((rows) => rows[0]);
}

function unitLabel(item: InventoryItemRow | undefined | null, units: Map<string, InventoryUnitRow>) {
  return units.get(item?.unit_id ?? "")?.abbreviation ?? item?.unit ?? "u";
}

function stockLabel(item: InventoryItemRow, units: Map<string, InventoryUnitRow>) {
  const base = `${formatNumber(item.current_stock)} ${unitLabel(item, units)}`;
  if (!item.presentation_unit_id || Number(item.units_per_presentation) <= 1) return base;
  const presentation = units.get(item.presentation_unit_id)?.abbreviation ?? "envases";
  return `${base} · ${formatNumber(Number(item.current_stock) / Number(item.units_per_presentation))} ${presentation}`;
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getPeriodRange(period: ReportPeriod) {
  const today = new Date();
  if (period === "day") return { start: localDateValue(today), end: localDateValue(today) };
  if (period === "week") return { start: localDateValue(addDays(today, -6)), end: localDateValue(today) };
  return { start: localDateValue(new Date(today.getFullYear(), today.getMonth(), 1)), end: localDateValue(today) };
}

function isWithinRange(value: string | null | undefined, range: { start: string; end: string }) {
  if (!value) return false;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : localDateValue(new Date(value));
  return date >= range.start && date <= range.end;
}

function movementTypeLabel(type: InventoryMovementRow["movement_type"]) {
  return { entrada: "Entrada", salida: "Salida", merma: "Merma", transferencia: "Transferencia", ajuste: "Ajuste", conteo: "Conteo" }[type];
}

function movementReference(mode: MovementMode) {
  return { entrada: "Entrada de inventario", salida: "Salida de inventario", paciente: "Uso por paciente", merma: "Merma o descarte" }[mode];
}

function movementSuccessText(mode: MovementMode, name: string, quantity: number, unit: string) {
  if (mode === "entrada") return `Entrada registrada: ${name} +${formatNumber(quantity)} ${unit}.`;
  if (mode === "paciente") return `Uso registrado en el paciente: ${name} -${formatNumber(quantity)} ${unit}.`;
  return `Descuento registrado: ${name} -${formatNumber(quantity)} ${unit}.`;
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.toLowerCase().includes("duplicate") || message.includes("Ya existe un producto")) return "Ya existe un producto con ese nombre.";
  if (message.includes("stock negativo") || message.includes("dejaria stock negativo")) return "No hay suficiente stock para realizar ese descuento.";
  if (message.includes("cancel_inventory_shift")) return "Primero debe aplicarse la actualización de seguridad de turnos en Supabase.";
  if (message.includes("Solo el superusuario")) return "Solo Superusuario puede borrar definitivamente.";
  if (message.toLowerCase().includes("foreign key") || message.toLowerCase().includes("violates")) return "No se puede borrar definitivamente porque todavía tiene historial relacionado. Puedes ocultarlo de la vista.";
  return message || "No pudimos completar la operación. Revisa los datos e intenta nuevamente.";
}
