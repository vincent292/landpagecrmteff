import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  Archive,
  Bell,
  Boxes,
  ClipboardCheck,
  Download,
  Layers,
  Package,
  Pencil,
  Plus,
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
import { restoreRecord, softDeleteRecord, type DeletableTable, type DeletionMetadata } from "../../services/adminDeletionService";
import {
  createInventoryCategory,
  createInventoryItem,
  createInventoryLocation,
  createInventoryLot,
  createInventorySupplier,
  createInventoryUnit,
  getInventoryCategories,
  getInventoryCounts,
  getInventoryItems,
  getInventoryLocations,
  getInventoryLots,
  getInventoryMovements,
  getInventorySuppliers,
  getInventoryUnits,
  recordInventoryCountLine,
  recordInventoryMovement,
  updateInventoryCategory,
  updateInventoryItem,
  updateInventoryLocation,
  updateInventoryLot,
  updateInventorySupplier,
  updateInventoryUnit,
  type InventoryCategoryRow,
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
type ModalKey = "item" | "category" | "unit" | "supplier" | "location" | "lot" | "movement" | "count" | null;

const tabs: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: "resumen", label: "Resumen", icon: <Boxes className="h-4 w-4" /> },
  { key: "items", label: "Items / Insumos", icon: <Package className="h-4 w-4" /> },
  { key: "categorias", label: "Categorias", icon: <Layers className="h-4 w-4" /> },
  { key: "lotes", label: "Lotes", icon: <Tags className="h-4 w-4" /> },
  { key: "movimientos", label: "Movimientos", icon: <Warehouse className="h-4 w-4" /> },
  { key: "conteos", label: "Conteos", icon: <ClipboardCheck className="h-4 w-4" /> },
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
  city: "",
  location_id: "",
  supplier_id: "",
  current_stock: 0,
  minimum_stock: 0,
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
  received_date: new Date().toISOString().slice(0, 10),
  expiration_date: "",
  initial_quantity: 0,
  current_quantity: 0,
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
  const [counts, setCounts] = useState<InventoryCountRow[]>([]);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalKey>(null);
  const [editing, setEditing] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [lotForm, setLotForm] = useState(emptyLotForm);
  const [movementForm, setMovementForm] = useState(emptyMovementForm);
  const [countForm, setCountForm] = useState(emptyCountForm);

  const actorId = profile?.id ?? user?.id ?? null;
  const actorName = profile?.full_name ?? user?.user_metadata.full_name ?? null;
  const actorEmail = profile?.email ?? user?.email ?? null;
  const includeDeleted = role === "superadmin";

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const unitMap = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);
  const supplierMap = useMemo(() => new Map(suppliers.map((supplier) => [supplier.id, supplier])), [suppliers]);
  const locationMap = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  const load = () => {
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
      getInventoryCounts(includeDeleted),
    ])
      .then(([itemRows, categoryRows, unitRows, supplierRows, locationRows, lotRows, movementRows, countRows]) => {
        setItems(itemRows);
        setCategories(categoryRows);
        setUnits(unitRows);
        setSuppliers(supplierRows);
        setLocations(locationRows);
        setLots(lotRows);
        setMovements(movementRows);
        setCounts(countRows);
      })
      .catch((loadError) => {
        console.error("Error cargando inventario profundo", loadError);
        setError(true);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [includeDeleted]);

  const activeItems = items.filter((item) => !item.is_deleted);
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
        supplierMap.get(item.supplier_id ?? "")?.name,
        locationMap.get(item.location_id ?? "")?.name,
      ])
        .toLowerCase()
        .includes(search)
    );
  }, [categoryMap, items, locationMap, query, supplierMap, unitMap]);

  const openModal = (nextModal: Exclude<ModalKey, null>, row?: unknown) => {
    setEditing(row ?? null);
    if (nextModal === "item") setItemForm(row ? itemToForm(row as InventoryItemRow) : emptyItemForm);
    if (nextModal === "category") setCategoryForm(row ? pickCategory(row as InventoryCategoryRow) : emptyCategoryForm);
    if (nextModal === "unit") setUnitForm(row ? pickUnit(row as InventoryUnitRow) : emptyUnitForm);
    if (nextModal === "supplier") setSupplierForm(row ? pickSupplier(row as InventorySupplierRow) : emptySupplierForm);
    if (nextModal === "location") setLocationForm(row ? pickLocation(row as InventoryLocationRow) : emptyLocationForm);
    if (nextModal === "lot") setLotForm(row ? lotToForm(row as InventoryLotRow) : emptyLotForm);
    if (nextModal === "movement") setMovementForm({ ...emptyMovementForm, item_id: activeItems[0]?.id ?? "" });
    if (nextModal === "count") setCountForm({ ...emptyCountForm, item_id: activeItems[0]?.id ?? "", location_id: locations[0]?.id ?? "" });
    setModal(nextModal);
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
  };

  const submit = async () => {
    setSaving(true);
    try {
      if (modal === "item") await saveItem();
      if (modal === "category") await saveSimple("inventory_categories", editing as InventoryCategoryRow | null, categoryForm, createInventoryCategory, updateInventoryCategory);
      if (modal === "unit") await saveSimple("inventory_units", editing as InventoryUnitRow | null, unitPayload(unitForm), createInventoryUnit, updateInventoryUnit);
      if (modal === "supplier") await saveSimple("inventory_suppliers", editing as InventorySupplierRow | null, supplierPayload(supplierForm), createInventorySupplier, updateInventorySupplier);
      if (modal === "location") await saveSimple("inventory_locations", editing as InventoryLocationRow | null, locationForm, createInventoryLocation, updateInventoryLocation);
      if (modal === "lot") await saveLot();
      if (modal === "movement") await saveMovement();
      if (modal === "count") await saveCount();
      closeModal();
      load();
    } finally {
      setSaving(false);
    }
  };

  const saveItem = async () => {
    const category = categoryMap.get(itemForm.category_id);
    const unit = unitMap.get(itemForm.unit_id);
    const payload = {
      ...itemForm,
      category: category?.name ?? "General",
      unit: unit?.abbreviation ?? "u",
      sku: normalizeText(itemForm.sku),
      barcode: normalizeText(itemForm.barcode),
      city: normalizeText(itemForm.city),
      category_id: normalizeText(itemForm.category_id),
      unit_id: normalizeText(itemForm.unit_id),
      supplier_id: normalizeText(itemForm.supplier_id),
      location_id: normalizeText(itemForm.location_id),
      lot_number: normalizeText(itemForm.lot_number),
      expiration_date: normalizeText(itemForm.expiration_date),
      notes: normalizeText(itemForm.notes),
      current_stock: Number(itemForm.current_stock),
      minimum_stock: Number(itemForm.minimum_stock),
      reference_cost: itemForm.reference_cost > 0 ? Number(itemForm.reference_cost) : null,
      sale_price: itemForm.sale_price > 0 ? Number(itemForm.sale_price) : null,
      alert_days_before_expiration: Number(itemForm.alert_days_before_expiration),
      updated_by: actorId,
    };
    const current = editing as InventoryItemRow | null;
    if (current) await updateInventoryItem(current.id, payload);
    else await createInventoryItem({ ...payload, created_by: actorId });
  };

  const saveLot = async () => {
    const payload = {
      ...lotForm,
      item_id: lotForm.item_id || activeItems[0]?.id,
      supplier_id: normalizeText(lotForm.supplier_id),
      location_id: normalizeText(lotForm.location_id),
      received_date: normalizeText(lotForm.received_date),
      expiration_date: normalizeText(lotForm.expiration_date),
      initial_quantity: Number(lotForm.initial_quantity),
      current_quantity: Number(lotForm.current_quantity),
      unit_cost: lotForm.unit_cost > 0 ? Number(lotForm.unit_cost) : null,
      notes: normalizeText(lotForm.notes),
      updated_by: actorId,
    };
    const current = editing as InventoryLotRow | null;
    if (current) await updateInventoryLot(current.id, payload);
    else await createInventoryLot({ ...payload, created_by: actorId });
  };

  const saveMovement = async () => {
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

  const exportReport = (kind: "items" | "lots" | "movements" | "counts" | "suppliers") => {
    const today = new Date().toISOString().slice(0, 10);
    if (kind === "items") {
      downloadCsv(`inventario-items-${today}.csv`, filteredItems.map((item) => itemReport(item, categoryMap, unitMap, supplierMap, locationMap)));
    }
    if (kind === "lots") {
      downloadCsv(`inventario-lotes-${today}.csv`, lots.map((lot) => lotReport(lot, itemMap, supplierMap, locationMap)));
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
            <CommandButton icon={<Warehouse className="h-4 w-4" />} label="Registrar entrada" onClick={() => openModal("movement")} />
            <CommandButton icon={<Archive className="h-4 w-4" />} label="Registrar merma" onClick={() => {
              openModal("movement");
              setMovementForm((current) => ({ ...current, movement_type: "merma" }));
            }} />
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <SummaryCard label="Total items" value={String(activeItems.length)} tone="green" />
            <SummaryCard label="Stock bajo" value={String(lowStock.length)} tone="gold" />
            <SummaryCard label="Sin stock" value={String(outOfStock.length)} tone="red" />
            <SummaryCard label="Por vencer" value={String(expiringLots.length)} tone="gold" />
            <SummaryCard label="Vencidos" value={String(expiredLots.length)} tone="red" />
            <SummaryCard label="Valor estimado" value={formatMoney(inventoryValue)} tone="green" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <Panel eyebrow="Operacion" title="Acciones rapidas">
              <div className="grid gap-3">
                <button onClick={() => openModal("movement")} className="rounded-full bg-[rgba(198,162,123,0.28)] px-5 py-3 text-sm font-bold text-[var(--color-ink)]">Registrar compra / entrada</button>
                <button onClick={() => { openModal("movement"); setMovementForm((current) => ({ ...current, movement_type: "merma" })); }} className="rounded-full bg-[rgba(154,107,67,0.14)] px-5 py-3 text-sm font-bold text-[var(--color-ink)]">Registrar merma</button>
                <button onClick={() => { openModal("movement"); setMovementForm((current) => ({ ...current, movement_type: "transferencia" })); }} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-bold text-white">Transferir ubicacion</button>
                <button onClick={() => openModal("count")} className="rounded-full bg-[var(--color-mocha)] px-5 py-3 text-sm font-bold text-white">Crear conteo</button>
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
                locationMap.get(item.location_id ?? "")?.name ?? "Sin lugar",
              ]}
              detail={`Stock ${item.current_stock} · minimo ${item.minimum_stock} · costo ${formatMoney(item.reference_cost)}`}
              deletedRow={item}
              actions={<CrudActions role={role} row={item} table="inventory_items" onEdit={() => openModal("item", item)} onArchive={() => void archive("inventory_items", item.id)} onRestore={() => void restoreRecord("inventory_items", item.id).then(load)} />}
            />
          )} />
        </Panel>
      ) : null}

      {activeTab === "categorias" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Panel eyebrow="Categorias" title="Familias de inventario" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Categoria" onClick={() => openModal("category")} primary />}>
            <RowsEmpty rows={categories} empty="Sin categorias." render={(category) => (
              <RowCard key={category.id} title={category.name} detail={category.description ?? "Sin descripcion"} deletedRow={category} actions={<CrudActions role={role} row={category} table="inventory_categories" onEdit={() => openModal("category", category)} onArchive={() => void archive("inventory_categories", category.id)} onRestore={() => void restoreRecord("inventory_categories", category.id).then(load)} />} />
            )} />
          </Panel>
          <Panel eyebrow="Unidades" title="Medidas y empaques" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Unidad" onClick={() => openModal("unit")} primary />}>
            <RowsEmpty rows={units} empty="Sin unidades." render={(unit) => (
              <RowCard key={unit.id} title={unit.name} tags={[unit.abbreviation, unit.unit_type, unit.is_base_unit ? "Base" : `x ${unit.conversion_factor}`]} detail="Medida disponible para items e insumos." deletedRow={unit} actions={<CrudActions role={role} row={unit} table="inventory_units" onEdit={() => openModal("unit", unit)} onArchive={() => void archive("inventory_units", unit.id)} onRestore={() => void restoreRecord("inventory_units", unit.id).then(load)} />} />
            )} />
          </Panel>
        </div>
      ) : null}

      {activeTab === "lotes" ? (
        <Panel eyebrow="Trazabilidad" title="Lotes y vencimientos" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Lote" onClick={() => openModal("lot")} primary />}>
          <RowsEmpty rows={lots} empty="Sin lotes." render={(lot) => (
            <RowCard key={lot.id} title={`${itemMap.get(lot.item_id)?.name ?? "Item"} · ${lot.lot_number}`} tags={[locationMap.get(lot.location_id ?? "")?.name ?? "Sin lugar", supplierMap.get(lot.supplier_id ?? "")?.name ?? "Sin proveedor"]} detail={`Cantidad ${lot.current_quantity} / ${lot.initial_quantity} · vence ${formatDate(lot.expiration_date) || "sin fecha"} · costo ${formatMoney(lot.unit_cost)}`} deletedRow={lot} actions={<CrudActions role={role} row={lot} table="inventory_lots" onEdit={() => openModal("lot", lot)} onArchive={() => void archive("inventory_lots", lot.id)} onRestore={() => void restoreRecord("inventory_lots", lot.id).then(load)} />} />
          )} />
        </Panel>
      ) : null}

      {activeTab === "movimientos" ? (
        <Panel eyebrow="Kardex" title="Entradas, salidas, mermas y transferencias" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Movimiento" onClick={() => openModal("movement")} primary />}>
          <RowsEmpty rows={movements} empty="Sin movimientos." render={(movement) => (
            <RowCard key={movement.id} title={`${movement.item_name_snapshot} · ${movement.movement_type}`} tags={[movement.lot_number_snapshot ?? "Sin lote", movement.supplier_name_snapshot ?? "Sin proveedor"]} detail={`${movement.quantity} · ${movement.reason ?? "Sin motivo"} · ${new Date(movement.movement_date).toLocaleString("es-BO")}`} deletedRow={movement} actions={<CrudActions role={role} row={movement} table="inventory_movements" onEdit={undefined} onArchive={() => void archive("inventory_movements", movement.id)} onRestore={() => void restoreRecord("inventory_movements", movement.id).then(load)} />} />
          )} />
        </Panel>
      ) : null}

      {activeTab === "conteos" ? (
        <Panel eyebrow="Conteos" title="Conteos fisicos y diferencias" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Conteo" onClick={() => openModal("count")} primary />}>
          <RowsEmpty rows={counts} empty="Sin conteos." render={(count) => (
            <RowCard key={count.id} title={`${count.count_date} · ${count.status}`} tags={[locationMap.get(count.location_id ?? "")?.name ?? "Sin lugar"]} detail={count.notes ?? "Sin notas"} deletedRow={count} actions={<CrudActions role={role} row={count} table="inventory_counts" onEdit={undefined} onArchive={() => void archive("inventory_counts", count.id)} onRestore={() => void restoreRecord("inventory_counts", count.id).then(load)} />} />
          )} />
        </Panel>
      ) : null}

      {activeTab === "alertas" ? (
        <Panel eyebrow="Alertas" title="Riesgos de stock y vencimiento">
          <RowsEmpty rows={alertRows} empty="Sin alertas activas." render={(row) => <AlertRow key={`${row.title}-${row.detail}`} title={row.title} detail={row.detail} />} />
        </Panel>
      ) : null}

      {activeTab === "reportes" ? (
        <Panel eyebrow="Reportes" title="Descargas CSV">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <ReportButton label="Items" onClick={() => exportReport("items")} />
            <ReportButton label="Lotes" onClick={() => exportReport("lots")} />
            <ReportButton label="Kardex" onClick={() => exportReport("movements")} />
            <ReportButton label="Conteos" onClick={() => exportReport("counts")} />
            <ReportButton label="Proveedores" onClick={() => exportReport("suppliers")} />
          </div>
        </Panel>
      ) : null}

      {activeTab === "proveedores" ? (
        <div className="grid gap-5 xl:grid-cols-3">
          <Panel eyebrow="Proveedores" title="Contactos de compra" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Proveedor" onClick={() => openModal("supplier")} primary />}>
            <RowsEmpty rows={suppliers} empty="Sin proveedores." render={(supplier) => (
              <RowCard key={supplier.id} title={supplier.name} tags={[supplier.contact_name ?? "Sin contacto", supplier.phone ?? "Sin telefono", supplier.whatsapp_phone ?? "Sin WhatsApp"]} detail={`${supplier.email ?? "Sin email"} · plazo ${supplier.payment_terms_days ?? 0} dias · ${supplier.allows_consignment ? "Con consignacion" : "Compra directa"} · ${supplier.notes ?? "Sin notas"}`} deletedRow={supplier} actions={<CrudActions role={role} row={supplier} table="inventory_suppliers" onEdit={() => openModal("supplier", supplier)} onArchive={() => void archive("inventory_suppliers", supplier.id)} onRestore={() => void restoreRecord("inventory_suppliers", supplier.id).then(load)} />} />
            )} />
          </Panel>
          <Panel eyebrow="Ubicaciones" title="Almacenes y zonas" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Ubicacion" onClick={() => openModal("location")} primary />}>
            <RowsEmpty rows={locations} empty="Sin ubicaciones." render={(location) => (
              <RowCard key={location.id} title={location.name} tags={[location.city ?? "Sin ciudad"]} detail={location.description ?? "Sin descripcion"} deletedRow={location} actions={<CrudActions role={role} row={location} table="inventory_locations" onEdit={() => openModal("location", location)} onArchive={() => void archive("inventory_locations", location.id)} onRestore={() => void restoreRecord("inventory_locations", location.id).then(load)} />} />
            )} />
          </Panel>
          <Panel eyebrow="Unidades" title="Medidas y empaques" action={<CommandButton icon={<Plus className="h-4 w-4" />} label="Unidad" onClick={() => openModal("unit")} primary />}>
            <RowsEmpty rows={units} empty="Sin unidades." render={(unit) => (
              <RowCard key={unit.id} title={unit.name} tags={[unit.abbreviation, unit.unit_type]} detail={unit.is_base_unit ? "Unidad base" : `Equivale a ${unit.conversion_factor}`} deletedRow={unit} actions={<CrudActions role={role} row={unit} table="inventory_units" onEdit={() => openModal("unit", unit)} onArchive={() => void archive("inventory_units", unit.id)} onRestore={() => void restoreRecord("inventory_units", unit.id).then(load)} />} />
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
            countForm,
            setCountForm,
            items: activeItems,
            categories,
            units,
            suppliers,
            locations,
            lots,
            itemMap,
          })}
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

function CrudActions({
  role,
  row,
  table,
  onEdit,
  onArchive,
  onRestore,
}: {
  role: ReturnType<typeof useAuth>["role"];
  row: DeletionMetadata;
  table: DeletableTable;
  onEdit?: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <>
      {onEdit ? (
        <button onClick={onEdit} className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
          <Pencil className="h-4 w-4" />
          Editar
        </button>
      ) : null}
      <DeleteActions role={role} row={row} compact onSoftDelete={onArchive} onRestore={onRestore} />
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

function ReportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[rgba(247,242,236,0.78)] px-4 py-5 text-sm font-bold">
      <Download className="h-4 w-4" />
      {label}
    </button>
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
  countForm: typeof emptyCountForm;
  setCountForm: (value: typeof emptyCountForm) => void;
  items: InventoryItemRow[];
  categories: InventoryCategoryRow[];
  units: InventoryUnitRow[];
  suppliers: InventorySupplierRow[];
  locations: InventoryLocationRow[];
  lots: InventoryLotRow[];
  itemMap: Map<string, InventoryItemRow>;
}) {
  if (props.modal === "item") {
    const f = props.itemForm;
    const set = props.setItemForm;
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="Nombre" value={f.name} onChange={(name) => set({ ...f, name })} />
        <SelectField label="Tipo" value={f.item_type} onChange={(item_type) => set({ ...f, item_type })} options={["insumo", "producto", "material", "equipo"].map((value) => ({ value, label: value }))} />
        <SelectField label="Categoria" value={f.category_id} onChange={(category_id) => set({ ...f, category_id })} options={props.categories.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField label="SKU" value={f.sku} onChange={(sku) => set({ ...f, sku })} />
        <TextField label="Codigo de barras" value={f.barcode} onChange={(barcode) => set({ ...f, barcode })} />
        <SelectField label="Unidad / medida" value={f.unit_id} onChange={(unit_id) => set({ ...f, unit_id })} options={props.units.map((u) => ({ value: u.id, label: `${u.name} (${u.abbreviation})` }))} />
        <CityField label="Ciudad" value={f.city} onChange={(city) => set({ ...f, city })} />
        <SelectField label="Ubicacion" value={f.location_id} onChange={(location_id) => set({ ...f, location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <SelectField label="Proveedor principal" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <NumberField label="Stock actual" value={f.current_stock} onChange={(current_stock) => set({ ...f, current_stock })} />
        <NumberField label="Stock minimo" value={f.minimum_stock} onChange={(minimum_stock) => set({ ...f, minimum_stock })} />
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
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Item" value={f.item_id} onChange={(item_id) => set({ ...f, item_id })} options={props.items.map((i) => ({ value: i.id, label: i.name }))} />
        <TextField label="Numero de lote" value={f.lot_number} onChange={(lot_number) => set({ ...f, lot_number })} />
        <SelectField label="Proveedor" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <SelectField label="Ubicacion" value={f.location_id} onChange={(location_id) => set({ ...f, location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <Field label="Fecha de recepcion"><input type="date" value={f.received_date} onChange={(event) => set({ ...f, received_date: event.target.value })} className="premium-input" /></Field>
        <Field label="Vencimiento"><input type="date" value={f.expiration_date} onChange={(event) => set({ ...f, expiration_date: event.target.value })} className="premium-input" /></Field>
        <NumberField label="Cantidad inicial" value={f.initial_quantity} onChange={(initial_quantity) => set({ ...f, initial_quantity })} />
        <NumberField label="Cantidad actual" value={f.current_quantity} onChange={(current_quantity) => set({ ...f, current_quantity })} />
        <NumberField label="Costo unitario" value={f.unit_cost} onChange={(unit_cost) => set({ ...f, unit_cost })} />
        <TextareaField label="Notas" value={f.notes} onChange={(notes) => set({ ...f, notes })} />
      </div>
    );
  }

  if (props.modal === "movement") {
    const f = props.movementForm;
    const set = props.setMovementForm;
    const itemLots = props.lots.filter((lot) => lot.item_id === f.item_id);
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField label="Item" value={f.item_id} onChange={(item_id) => set({ ...f, item_id, lot_id: "" })} options={props.items.map((i) => ({ value: i.id, label: i.name }))} />
        <SelectField label="Tipo de movimiento" value={f.movement_type} onChange={(movement_type) => set({ ...f, movement_type: movement_type as InventoryMovementRow["movement_type"] })} options={["entrada", "salida", "merma", "transferencia", "ajuste"].map((v) => ({ value: v, label: v }))} />
        <NumberField label="Cantidad" value={f.quantity} onChange={(quantity) => set({ ...f, quantity })} />
        <NumberField label="Costo unitario" value={f.unit_cost} onChange={(unit_cost) => set({ ...f, unit_cost })} />
        <SelectField label="Lote" value={f.lot_id} onChange={(lot_id) => set({ ...f, lot_id })} options={itemLots.map((l) => ({ value: l.id, label: l.lot_number }))} />
        <SelectField label="Proveedor" value={f.supplier_id} onChange={(supplier_id) => set({ ...f, supplier_id })} options={props.suppliers.map((s) => ({ value: s.id, label: s.name }))} />
        <SelectField label="Desde ubicacion" value={f.from_location_id} onChange={(from_location_id) => set({ ...f, from_location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <SelectField label="Hacia ubicacion" value={f.to_location_id} onChange={(to_location_id) => set({ ...f, to_location_id })} options={props.locations.map((l) => ({ value: l.id, label: l.name }))} />
        <TextField label="Referencia" value={f.reference} onChange={(reference) => set({ ...f, reference })} />
        <Field label="Fecha"><input type="datetime-local" value={f.movement_date} onChange={(event) => set({ ...f, movement_date: event.target.value })} className="premium-input" /></Field>
        <TextareaField label="Motivo" value={f.reason} onChange={(reason) => set({ ...f, reason })} />
      </div>
    );
  }

  const f = props.countForm;
  const set = props.setCountForm;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <SelectField label="Item" value={f.item_id} onChange={(item_id) => {
        const item = props.itemMap.get(item_id);
        set({ ...f, item_id, counted_stock: Number(item?.current_stock ?? 0) });
      }} options={props.items.map((i) => ({ value: i.id, label: i.name }))} />
      <NumberField label="Stock contado" value={f.counted_stock} onChange={(counted_stock) => set({ ...f, counted_stock })} />
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
      <NumberField label="Plazo de pago en dias" value={form.payment_terms_days} onChange={(payment_terms_days) => setForm({ ...form, payment_terms_days })} />
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
  return {
    name: item.name,
    item_type: item.item_type ?? "insumo",
    category_id: item.category_id ?? "",
    sku: item.sku ?? "",
    barcode: item.barcode ?? "",
    unit_id: item.unit_id ?? "",
    city: item.city ?? "",
    location_id: item.location_id ?? "",
    supplier_id: item.supplier_id ?? "",
    current_stock: Number(item.current_stock ?? 0),
    minimum_stock: Number(item.minimum_stock ?? 0),
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
  return {
    item_id: lot.item_id,
    lot_number: lot.lot_number,
    supplier_id: lot.supplier_id ?? "",
    location_id: lot.location_id ?? "",
    received_date: lot.received_date ?? "",
    expiration_date: lot.expiration_date ?? "",
    initial_quantity: Number(lot.initial_quantity ?? 0),
    current_quantity: Number(lot.current_quantity ?? 0),
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
    unidad: unitMap.get(item.unit_id ?? "")?.abbreviation ?? item.unit,
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
  locationMap: Map<string, InventoryLocationRow>
) {
  return {
    item: itemMap.get(lot.item_id)?.name,
    lote: lot.lot_number,
    proveedor: supplierMap.get(lot.supplier_id ?? "")?.name,
    ubicacion: locationMap.get(lot.location_id ?? "")?.name,
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
