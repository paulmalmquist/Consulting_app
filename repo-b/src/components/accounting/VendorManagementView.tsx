"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useBusinessContext } from "@/lib/business-context";
import { useAccountingStore, type VendorInput } from "@/lib/accounting/store";
import type { Vendor, VendorStatus } from "@/types/accounting";

type VendorFormState = {
  name: string;
  legalName: string;
  taxId: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email: string;
  phone: string;
  paymentTerms: "Net 15" | "Net 30" | "Net 45";
  defaultExpenseAccount: string;
  is1099Eligible: boolean;
};

const EMPTY_FORM: VendorFormState = {
  name: "",
  legalName: "",
  taxId: "",
  street: "",
  city: "",
  state: "",
  zip: "",
  country: "USA",
  email: "",
  phone: "",
  paymentTerms: "Net 30",
  defaultExpenseAccount: "6100 - Professional Fees",
  is1099Eligible: false,
};

function toInput(form: VendorFormState): VendorInput {
  return {
    name: form.name.trim(),
    legalName: form.legalName.trim(),
    taxId: form.taxId.trim(),
    address: {
      street: form.street.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      zip: form.zip.trim(),
      country: form.country.trim(),
    },
    email: form.email.trim(),
    phone: form.phone.trim(),
    paymentTerms: form.paymentTerms,
    defaultExpenseAccount: form.defaultExpenseAccount.trim(),
    is1099Eligible: form.is1099Eligible,
  };
}

function fromVendor(vendor: Vendor): VendorFormState {
  return {
    name: vendor.name,
    legalName: vendor.legalName,
    taxId: vendor.taxId,
    street: vendor.address.street,
    city: vendor.address.city,
    state: vendor.address.state,
    zip: vendor.address.zip,
    country: vendor.address.country,
    email: vendor.email,
    phone: vendor.phone,
    paymentTerms: vendor.paymentTerms,
    defaultExpenseAccount: vendor.defaultExpenseAccount,
    is1099Eligible: vendor.is1099Eligible,
  };
}

function statusVariant(status: VendorStatus): "success" | "default" {
  return status === "active" ? "success" : "default";
}

export default function VendorManagementView() {
  const { businessId } = useBusinessContext();
  const { ready, vendors, addVendor, updateVendor, setVendorStatus } = useAccountingStore(businessId);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [form, setForm] = useState<VendorFormState>(EMPTY_FORM);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vendors;
    return vendors.filter((vendor) => {
      return (
        vendor.name.toLowerCase().includes(query) ||
        vendor.legalName.toLowerCase().includes(query) ||
        vendor.taxId.toLowerCase().includes(query) ||
        vendor.defaultExpenseAccount.toLowerCase().includes(query)
      );
    });
  }, [vendors, search]);

  const openCreate = () => {
    setEditingVendorId(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (vendor: Vendor) => {
    setEditingVendorId(vendor.id);
    setForm(fromVendor(vendor));
    setOpen(true);
  };

  const submit = () => {
    const payload = toInput(form);
    if (!payload.name || !payload.legalName || !payload.taxId || !payload.email) return;
    if (editingVendorId) {
      updateVendor(editingVendorId, payload);
    } else {
      addVendor(payload);
    }
    setOpen(false);
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Vendor Management</h1>
        <Button data-testid="add-vendor-button" onClick={openCreate}>Add Vendor</Button>
      </div>

      <div className="flex items-center gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search vendors"
          aria-label="Search vendors"
        />
        <Badge variant="accent">{filtered.length} vendors</Badge>
      </div>

      {!ready ? (
        <Card>
          <CardContent>
            <p className="text-sm text-bm-muted">Loading vendor records...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm" data-testid="vendor-table">
              <thead>
                <tr className="border-b border-bm-border/70 text-left text-xs uppercase tracking-[0.12em] text-bm-muted2">
                  <th className="px-4 py-3">Vendor Name</th>
                  <th className="px-4 py-3">Legal Name</th>
                  <th className="px-4 py-3">Payment Terms</th>
                  <th className="px-4 py-3">1099?</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Default Account</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vendor) => (
                  <tr key={vendor.id} data-testid={`vendor-row-${vendor.id}`} className="border-b border-bm-border/40">
                    <td className="px-4 py-3 font-medium">{vendor.name}</td>
                    <td className="px-4 py-3">{vendor.legalName}</td>
                    <td className="px-4 py-3">{vendor.paymentTerms}</td>
                    <td className="px-4 py-3">{vendor.is1099Eligible ? "Yes" : "No"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(vendor.status)}>{vendor.status}</Badge>
                    </td>
                    <td className="px-4 py-3">{vendor.defaultExpenseAccount}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" onClick={() => openEdit(vendor)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setVendorStatus(vendor.id, vendor.status === "active" ? "inactive" : "active")}
                        >
                          {vendor.status === "active" ? "Set Inactive" : "Set Active"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editingVendorId ? "Edit Vendor" : "Add Vendor"}
        description="Vendor master profile"
      >
        <div data-testid="vendor-modal" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Vendor name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          <Input placeholder="Legal name" value={form.legalName} onChange={(e) => setForm((prev) => ({ ...prev, legalName: e.target.value }))} />
          <Input placeholder="Tax ID (EIN)" value={form.taxId} onChange={(e) => setForm((prev) => ({ ...prev, taxId: e.target.value }))} />
          <Select value={form.paymentTerms} onChange={(e) => setForm((prev) => ({ ...prev, paymentTerms: e.target.value as VendorFormState["paymentTerms"] }))}>
            <option value="Net 15">Net 15</option>
            <option value="Net 30">Net 30</option>
            <option value="Net 45">Net 45</option>
          </Select>
          <Input placeholder="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
          <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
          <Input className="sm:col-span-2" placeholder="Street" value={form.street} onChange={(e) => setForm((prev) => ({ ...prev, street: e.target.value }))} />
          <Input placeholder="City" value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
          <Input placeholder="State" value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} />
          <Input placeholder="Zip" value={form.zip} onChange={(e) => setForm((prev) => ({ ...prev, zip: e.target.value }))} />
          <Input placeholder="Country" value={form.country} onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))} />
          <Input className="sm:col-span-2" placeholder="Default expense account" value={form.defaultExpenseAccount} onChange={(e) => setForm((prev) => ({ ...prev, defaultExpenseAccount: e.target.value }))} />
          <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-bm-text">
            <input
              type="checkbox"
              checked={form.is1099Eligible}
              onChange={(e) => setForm((prev) => ({ ...prev, is1099Eligible: e.target.checked }))}
            />
            1099 Eligible
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button data-testid="vendor-submit-button" onClick={submit}>
            {editingVendorId ? "Save" : "Add Vendor"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
