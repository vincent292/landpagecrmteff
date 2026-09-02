import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  Download,
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

import { InventorySimpleOrdersPanel } from "../../components/admin/InventorySimpleOrdersPanel";
import { EmptyState, ErrorState, LoadingState } from "../../components/common/AsyncState";
import { useAuth } from "../../hooks/useAuth";
import { recordClinicalInventoryUsage } from "../../services/clinicalHistoryService";
import {
  cancelInventoryShift,
  closeInventoryShift,
  createInventoryItem,
  createInventoryLot,
  createInventorySupplier,
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
  updateInventoryShiftLine,
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
  const [showItemModal, setShowItemModal] = useState(false);
  const [showMovementModal, setShowMovementModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [itemForm, setItemForm] = useState<ItemForm>(() => emptyItemForm());
  const [movementForm, setMovementForm] = useState<MovementForm>(() => emptyMovementForm("entrada"));
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplierForm);
  const [shiftName, setShiftName] = useState("");
  const [shiftDrafts, setShiftDrafts] = useState<Record<string, Record<string, string>>>({});
  const [shiftSearch, setShiftSearch] = useState<Record<string, string>>({});
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("day");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [itemRows, categoryRows, unitRows, supplierRows, locationRows, lotRows, movementRows, usageRows, countRows, lineRows, patientRows] = await Promise.all([
        getInventoryItems(false),
        getInventoryCategories(false),
        getInventoryUnits(false),
        getInventorySuppliers(false),
        getInventoryLocations(false),
        getInventoryLots(false),
        getInventoryMovements(false),
        getInventoryClinicalUsages(false),
        getInventoryCounts(false),
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
  }, [role]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const itemMap = useMemo(() => new Map(items.map((row) => [row.id, row])), [items]);
  const unitMap = useMemo(() => new Map(units.map((row) => [row.id, row])), [units]);
  const openShifts = counts.filter((row) => row.status === "abierto" && !row.is_deleted);
  const closedShifts = counts.filter((row) => row.status === "cerrado" && !row.is_deleted);
  const lowStockItems = items.filter((row) => Number(row.current_stock) <= Number(row.minimum_stock));
  const expiredItems = items.filter((row) => row.expiration_date && row.expiration_date < localDateValue());
  const expiredLots = lots.filter((row) => row.expiration_date && row.expiration_date < localDateValue() && Number(row.current_quantity) > 0);
  const duplicateNames = useMemo(() => findDuplicateNames(items), [items]);
  const clinicalMovementIds = useMemo(
    () => new Set(clinicalUsages.map((row) => row.inventory_movement_id).filter((id): id is string => Boolean(id))),
    [clinicalUsages]
  );
  const filteredItems = useMemo(() => {
    const normalized = normalizeName(query);
    if (!normalized) return items;
    return items.filter((row) => normalizeName(`${row.name} ${row.sku ?? ""}`).includes(normalized));
  }, [items, query]);
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

  const openItemModal = (item?: InventoryItemRow) => {
    setNotice(null);
    setItemForm(item ? itemToSimpleForm(item) : emptyItemForm(units[0]?.id ?? ""));
    setShowItemModal(true);
  };

  const openMovement = (mode: MovementMode, itemId = "") => {
    setNotice(null);
    setMovementForm({ ...emptyMovementForm(mode), item_id: itemId });
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

    setSaving(true);
    setNotice(null);
    try {
      const unit = unitMap.get(itemForm.unit_id);
      const category = categories.find((row) => row.id === itemForm.category_id);
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
    const baseQuantity = movementForm.mode === "entrada" && usesPresentation
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
      await openInventoryShift({ shiftName: shiftName.trim() || `Turno ${formatDate(localDateValue())}`, countDate: localDateValue() });
      setShowShiftModal(false);
      setShiftName("");
      setNotice({ type: "success", text: "Turno abierto. Al finalizar, cuenta los productos y cierra el turno." });
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
    const missing = lines.filter((line) => draft[line.id] == null || draft[line.id].trim() === "");
    if (missing.length > 0) {
      setNotice({ type: "error", text: `Falta contar ${missing.length} producto${missing.length === 1 ? "" : "s"}. Usa “Todo coincide” si verificaste el stock y no hay diferencias.` });
      return;
    }
    if (lines.some((line) => Number(draft[line.id]) < 0 || !Number.isFinite(Number(draft[line.id])))) {
      setNotice({ type: "error", text: "Revisa las cantidades: no pueden ser negativas." });
      return;
    }
    if (!window.confirm("¿Confirmas que terminaste el conteo físico? Al cerrar se actualizará el stock.")) return;

    setSaving(true);
    setNotice(null);
    try {
      await Promise.all(lines.map((line) => updateInventoryShiftLine({
        countId: shift.id,
        itemId: line.item_id,
        countedStock: Number(draft[line.id]),
        notes: null,
      })));
      await closeInventoryShift({ countId: shift.id, notes: "Conteo físico completado desde inventario simple" });
      setNotice({ type: "success", text: "Turno cerrado y stock actualizado." });
      setShiftDrafts((current) => ({ ...current, [shift.id]: {} }));
      await load();
    } catch (error) {
      setNotice({ type: "error", text: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  const cancelShift = async (shift: InventoryCountRow) => {
    if (!window.confirm("¿Cancelar este turno sin modificar el stock? Esta opción es segura para turnos antiguos o abiertos por error.")) return;
    setSaving(true);
    try {
      await cancelInventoryShift({ countId: shift.id, notes: "Cancelado desde inventario simple" });
      setNotice({ type: "success", text: "Turno cancelado sin modificar el stock." });
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
          countLines={countLines}
          itemMap={itemMap}
          unitMap={unitMap}
          drafts={shiftDrafts}
          setDrafts={setShiftDrafts}
          searches={shiftSearch}
          setSearches={setShiftSearch}
          saving={saving}
          onOpen={() => setShowShiftModal(true)}
          onClose={closeShift}
          onCancel={cancelShift}
        />
      ) : null}

      {activeTab === "inventario" ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Metric label="Productos" value={String(items.length)} />
            <Metric label="Stock bajo" value={String(lowStockItems.length)} warning={lowStockItems.length > 0} />
            <Metric label="Vencidos" value={String(expiredItems.length + expiredLots.length)} danger={expiredItems.length + expiredLots.length > 0} />
            <Metric label="Duplicados" value={String(duplicateNames.length)} warning={duplicateNames.length > 0} />
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
            <label className="flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-white px-4 py-3">
              <Search className="h-4 w-4 text-[var(--color-copy)]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" className="w-full bg-transparent text-sm outline-none" />
            </label>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => (
                <article key={item.id} className="rounded-[20px] border border-[var(--color-border)] bg-[rgba(247,242,236,0.7)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-ink)]">{item.name}</p>
                      <p className="mt-1 text-sm text-[var(--color-copy)]">{stockLabel(item, unitMap)}</p>
                    </div>
                    <button type="button" onClick={() => openItemModal(item)} aria-label={`Editar ${item.name}`} className="rounded-full border border-[var(--color-border)] bg-white p-2"><Pencil className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Number(item.current_stock) <= Number(item.minimum_stock) ? <SmallTag text="Stock bajo" tone="warning" /> : <SmallTag text="Disponible" />}
                    {item.expiration_date ? <SmallTag text={`Vence ${formatDate(item.expiration_date)}`} tone={item.expiration_date < localDateValue() ? "danger" : "normal"} /> : null}
                    {item.presentation_unit_id && Number(item.units_per_presentation) > 1 ? <SmallTag text={`1 ${unitMap.get(item.presentation_unit_id)?.abbreviation ?? "envase"} = ${formatNumber(item.units_per_presentation)} ${unitLabel(item, unitMap)}`} /> : null}
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <MiniButton label="Entrar" onClick={() => openMovement("entrada", item.id)} />
                    <MiniButton label="Salir" onClick={() => openMovement("salida", item.id)} />
                    <MiniButton label="Paciente" onClick={() => openMovement("paciente", item.id)} />
                  </div>
                </article>
              ))}
              {filteredItems.length === 0 ? <EmptyState label="No encontramos productos con ese nombre." /> : null}
            </div>
          </SimplePanel>

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
            items={items}
            locations={locations}
            units={units}
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
              <TextField label="Nombre" value={itemForm.name} onChange={(name) => setItemForm({ ...itemForm, name })} placeholder="Ej. Aguja 30G" autoFocus />
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
            <SelectField label="Se descuenta por" value={itemForm.unit_id} onChange={(unit_id) => setItemForm({ ...itemForm, unit_id })} options={units.map((row) => ({ value: row.id, label: `${row.name} (${row.abbreviation})` }))} />
            <SelectField label="Categoría (opcional)" value={itemForm.category_id} onChange={(category_id) => setItemForm({ ...itemForm, category_id })} options={categories.map((row) => ({ value: row.id, label: row.name }))} allowEmpty />
            <SelectField label="Llega en (opcional)" value={itemForm.presentation_unit_id} onChange={(presentation_unit_id) => setItemForm({ ...itemForm, presentation_unit_id, units_per_presentation: presentation_unit_id ? itemForm.units_per_presentation : 1 })} options={units.map((row) => ({ value: row.id, label: `${row.name} (${row.abbreviation})` }))} allowEmpty emptyLabel="La misma unidad" />
            {itemForm.presentation_unit_id ? <NumberField label="¿Cuántas unidades trae?" value={itemForm.units_per_presentation} onChange={(units_per_presentation) => setItemForm({ ...itemForm, units_per_presentation })} min={0.01} /> : null}
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
          items={items}
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

      {showShiftModal ? (
        <Modal title="Abrir turno" onClose={() => setShowShiftModal(false)}>
          <TextField label="Responsable o nombre del turno" value={shiftName} onChange={setShiftName} placeholder={profile?.full_name ?? "Ej. Turno mañana"} autoFocus />
          <p className="mt-4 rounded-[16px] bg-[rgba(247,242,236,0.8)] px-4 py-3 text-sm leading-6 text-[var(--color-copy)]">Solo puede existir un turno activo. Cuando termines, el sistema te pedirá contar cada producto antes de cerrar.</p>
          <ModalActions saving={saving} onSave={() => void createShift()} onCancel={() => setShowShiftModal(false)} saveLabel="Abrir turno" />
        </Modal>
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
  countLines,
  itemMap,
  unitMap,
  drafts,
  setDrafts,
  searches,
  setSearches,
  saving,
  onOpen,
  onClose,
  onCancel,
}: {
  openShifts: InventoryCountRow[];
  closedShifts: InventoryCountRow[];
  countLines: InventoryCountLineRow[];
  itemMap: Map<string, InventoryItemRow>;
  unitMap: Map<string, InventoryUnitRow>;
  drafts: Record<string, Record<string, string>>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  searches: Record<string, string>;
  setSearches: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  saving: boolean;
  onOpen: () => void;
  onClose: (shift: InventoryCountRow) => Promise<void>;
  onCancel: (shift: InventoryCountRow) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      {openShifts.length === 0 ? (
        <section className="rounded-[28px] border border-[var(--color-border)] bg-white/80 p-6 text-center shadow-[0_14px_40px_rgba(62,42,31,0.06)]">
          <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" />
          <h2 className="font-display mt-3 text-2xl font-semibold text-[var(--color-ink)]">No hay un turno abierto</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--color-copy)]">Abre uno cuando la persona responsable reciba el inventario. Al terminar deberá contar y cerrarlo.</p>
          <button onClick={onOpen} className="mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white"><ClipboardCheck className="h-4 w-4" /> Abrir turno</button>
        </section>
      ) : null}

      {openShifts.length > 1 ? (
        <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">Hay {openShifts.length} turnos antiguos abiertos. Cancela los que ya no correspondan; cancelar no cambia el stock.</div>
      ) : null}

      {openShifts.map((shift) => {
        const lines = countLines.filter((line) => line.count_id === shift.id && itemMap.has(line.item_id));
        const draft = drafts[shift.id] ?? {};
        const completed = lines.filter((line) => draft[line.id] != null && draft[line.id].trim() !== "").length;
        const stale = shift.count_date < localDateValue();
        const search = normalizeName(searches[shift.id] ?? "");
        const visibleLines = lines.filter((line) => normalizeName(itemMap.get(line.item_id)?.name ?? "").includes(search));
        return (
          <SimplePanel
            key={shift.id}
            title={shift.shift_name || "Turno de inventario"}
            action={<SmallTag text={stale ? "Turno antiguo" : "Turno abierto"} tone={stale ? "danger" : "warning"} />}
          >
            <div className="flex flex-col gap-3 rounded-[18px] bg-[rgba(247,242,236,0.78)] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--color-ink)]">Abierto el {formatDate(shift.count_date)}</p>
                <p className="mt-1 text-sm text-[var(--color-copy)]">Conteo: {completed} de {lines.length} productos</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setDrafts((current) => ({ ...current, [shift.id]: Object.fromEntries(lines.map((line) => [line.id, String(line.expected_stock)])) }))}
                  className="rounded-full border border-[var(--color-border)] bg-white px-4 py-2 text-sm font-semibold"
                >
                  Todo coincide
                </button>
                <button type="button" onClick={() => void onCancel(shift)} disabled={saving} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Cancelar</button>
              </div>
            </div>

            {stale ? (
              <div className="mt-4 rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Este turno pertenece a una fecha anterior. Por seguridad no se debe cerrar con valores viejos; cancélalo sin modificar stock y abre uno nuevo.</div>
            ) : (
              <>
                <label className="mt-4 flex items-center gap-3 rounded-[16px] border border-[var(--color-border)] bg-white px-4 py-3">
                  <Search className="h-4 w-4" />
                  <input value={searches[shift.id] ?? ""} onChange={(event) => setSearches((current) => ({ ...current, [shift.id]: event.target.value }))} placeholder="Buscar producto para contar" className="w-full bg-transparent text-sm outline-none" />
                </label>
                <div className="mt-4 grid gap-2">
                  {visibleLines.map((line) => {
                    const item = itemMap.get(line.item_id)!;
                    return (
                      <div key={line.id} className="grid gap-3 rounded-[16px] border border-[var(--color-border)] bg-white/80 p-3 sm:grid-cols-[1fr_160px] sm:items-center">
                        <div>
                          <p className="font-semibold text-[var(--color-ink)]">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-copy)]">Sistema: {formatNumber(line.expected_stock)} {unitLabel(item, unitMap)}</p>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={draft[line.id] ?? ""}
                          onChange={(event) => setDrafts((current) => ({ ...current, [shift.id]: { ...(current[shift.id] ?? {}), [line.id]: event.target.value } }))}
                          placeholder="Cantidad contada"
                          className="premium-input"
                        />
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => void onClose(shift)} disabled={saving || completed !== lines.length} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Cerrando..." : `Cerrar turno (${completed}/${lines.length})`}</button>
              </>
            )}
          </SimplePanel>
        );
      })}

      <SimplePanel title="Turnos anteriores">
        <div className="grid gap-2">
          {closedShifts.slice(0, 8).map((shift) => (
            <div key={shift.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--color-border)] bg-white/75 px-4 py-3">
              <div><p className="font-semibold text-[var(--color-ink)]">{shift.shift_name || "Turno"}</p><p className="mt-1 text-xs text-[var(--color-copy)]">{formatDate(shift.count_date)}</p></div>
              <SmallTag text="Cerrado" />
            </div>
          ))}
          {closedShifts.length === 0 ? <EmptyState label="Todavía no hay turnos cerrados." /> : null}
        </div>
      </SimplePanel>
    </div>
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
  const baseQuantity = form.mode === "entrada" && usesPresentation ? Number(form.quantity) * Number(item?.units_per_presentation ?? 1) : Number(form.quantity);
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
        <TextField label="Buscar producto" value={productSearch} onChange={setProductSearch} placeholder="Escribe parte del nombre" autoFocus />
        <SelectField label="Producto" value={form.item_id} onChange={(item_id) => {
          const selected = items.find((row) => row.id === item_id);
          setForm({ ...form, item_id, lot_id: "", supplier_id: selected?.supplier_id ?? "" });
          setProductSearch("");
        }} options={visibleItems.map((row) => ({ value: row.id, label: `${row.name} · ${formatNumber(row.current_stock)} ${unitLabel(row, units)}` }))} />
        <NumberField label={form.mode === "entrada" && usesPresentation ? `Cantidad de ${presentationLabel}` : `Cantidad en ${baseLabel}`} value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} min={0.01} />
        {form.mode === "entrada" && usesPresentation ? (
          <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 sm:col-span-2">{formatNumber(form.quantity)} {presentationLabel} agregarán {formatNumber(baseQuantity)} {baseLabel} al stock.</div>
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
  const differences = countLines.filter((row) => Number(row.difference_stock) !== 0);
  const exportRows = [
    ...movements.map((row) => ({ fecha: row.movement_date, tipo: row.movement_type, producto: row.item_name_snapshot, cantidad: row.quantity, unidad: row.unit_label_snapshot ?? itemMap.get(row.item_id)?.unit ?? "u", responsable: row.created_by_profile?.full_name ?? "", detalle: row.reason ?? row.reference ?? "" })),
    ...usages.map((row) => ({ fecha: row.created_at, tipo: "paciente", producto: row.inventory_items?.name ?? itemMap.get(row.item_id)?.name ?? "", cantidad: row.quantity, unidad: row.unit_label_snapshot ?? row.unit_label ?? "u", responsable: row.created_by_profile?.full_name ?? "", detalle: row.patients?.full_name ?? "" })),
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

function QuickAction({ label, icon, onClick, primary = false }: { label: string; icon: ReactNode; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold ${primary ? "bg-[var(--color-mocha)] text-white" : "border border-[var(--color-border)] bg-white text-[var(--color-ink)]"}`}>{icon}{label}</button>;
}

function MiniButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-full border border-[var(--color-border)] bg-white px-2 py-2 text-xs font-semibold">{label}</button>;
}

function SimplePanel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="rounded-[24px] border border-[var(--color-border)] bg-white/80 p-5 shadow-[0_12px_35px_rgba(62,42,31,0.05)]"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h2 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{title}</h2>{action}</div>{children}</section>;
}

function Metric({ label, value, warning = false, danger = false }: { label: string; value: string; warning?: boolean; danger?: boolean }) {
  return <div className={`rounded-[18px] border p-4 ${danger ? "border-red-200 bg-red-50" : warning ? "border-amber-200 bg-amber-50" : "border-[var(--color-border)] bg-white/80"}`}><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-copy)]">{label}</p><p className="mt-2 text-2xl font-semibold text-[var(--color-ink)]">{value}</p></div>;
}

function SmallTag({ text, tone = "normal" }: { text: string; tone?: "normal" | "warning" | "danger" }) {
  const style = tone === "danger" ? "bg-red-100 text-red-800" : tone === "warning" ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800";
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${style}`}>{text}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-[var(--color-cream)] p-5 shadow-2xl sm:rounded-[28px] sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-display text-2xl font-semibold text-[var(--color-ink)]">{title}</h2><button type="button" onClick={onClose} className="rounded-full border border-[var(--color-border)] bg-white p-2" aria-label="Cerrar"><X className="h-5 w-5" /></button></div>{children}</section></div>;
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
  return message || "No pudimos completar la operación. Revisa los datos e intenta nuevamente.";
}
