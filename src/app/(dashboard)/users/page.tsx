"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { apiFetch, ApiError } from "@/lib/api";
import { Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";

interface User {
  id: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch<{ users: User[] }>("/api/users");
    setUsers(data.users);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, password, role }),
      });
      setShowAdd(false);
      setEmail("");
      setPassword("");
      setRole("user");
      loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add user");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRole(u: User) {
    const nextRole = u.role === "admin" ? "user" : "admin";
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      loadUsers();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to update role");
    }
  }

  async function handleDelete(u: User) {
    if (!confirm(`Delete user ${u.email}?`)) return;
    try {
      await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
      loadUsers();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to delete user");
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage who can access this platform."
        action={
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-brand-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-700"
          >
            <Plus size={16} /> Add user
          </button>
        }
      />

      <div className="p-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Email</th>
                <th className="text-left px-6 py-3 font-medium">Role</th>
                <th className="text-left px-6 py-3 font-medium">Created</th>
                <th className="text-right px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{u.email}</td>
                  <td className="px-6 py-3">
                    <button
                      onClick={() => handleToggleRole(u)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        u.role === "admin" ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600"
                      }`}
                      title="Click to toggle role"
                    >
                      {u.role === "admin" && <ShieldCheck size={12} />}
                      {u.role}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleDelete(u)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add user">
        <form onSubmit={handleAddUser} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-brand-500"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-brand-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            Add user
          </button>
        </form>
      </Modal>
    </div>
  );
}
