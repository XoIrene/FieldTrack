import { useEffect, useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { Search, UserPlus, Pencil, Trash2, Users } from 'lucide-react';
import { supabase, createEphemeralClient } from '../../lib/supabase';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import type { Profile, FieldProject } from '../../types';
import { getInitials, isValidEmail, isValidPhone } from '../../lib/utils';

interface WorkerWithProjects extends Profile {
  projects?: FieldProject[];
}

export default function AdminWorkers() {
  const [workers, setWorkers] = useState<WorkerWithProjects[]>([]);
  const [projects, setProjects] = useState<FieldProject[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<WorkerWithProjects | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWorkers();
    loadProjects();
  }, []);

  async function loadWorkers() {
    try {
      // Fetch ALL workers with paginated ranges — there is NO artificial
      // 10-user cap. PostgREST returns at most 1000 rows per request, so
      // page through until a short page arrives. Total Users elsewhere
      // uses an exact head-count, never a page size.
      const PAGE = 1000;
      const all: Profile[] = [];
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'worker')
          .order('full_name')
          .range(page * PAGE, page * PAGE + PAGE - 1);

        if (error) throw error;
        all.push(...((data || []) as Profile[]));
        if (!data || data.length < PAGE) break;
      }
      const data = all;

      // Load assignments for each worker
      const workersWithProjects = await Promise.all(
        (data || []).map(async (worker) => {
          const { data: assignments } = await supabase
            .from('project_workers')
            .select('project:field_projects(*)')
            .eq('worker_id', worker.id);

          return {
            ...worker,
            projects: assignments?.map((a: any) => a.project).filter(Boolean) || [],
          };
        })
      );

      setWorkers(workersWithProjects as WorkerWithProjects[]);
    } catch (error) {
      console.error('Error loading workers:', error);
      toast.error('Failed to load workers.');
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects() {
    try {
      const { data, error } = await supabase
        .from('field_projects')
        .select('*')
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setProjects((data || []) as FieldProject[]);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  async function handleAddWorker(e: FormEvent) {
    e.preventDefault();

    if (!formData.full_name || !formData.email || !formData.phone || !formData.password) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (!isValidEmail(formData.email)) {
      toast.error('Please enter a valid email.');
      return;
    }

    if (!isValidPhone(formData.phone)) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    setSaving(true);
    try {
      // Create the auth user with an ephemeral client (anon key, no session
      // persistence) so the current admin session is not overwritten.
      // The `handle_new_user` DB trigger auto-creates the profile row.
      const ephemeral = createEphemeralClient();
      const { data: signUpData, error: signUpError } = await ephemeral.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name,
            phone: formData.phone,
          },
        },
      });

      if (signUpError) throw signUpError;
      const newUserId = signUpData.user?.id;
      if (!newUserId) {
        throw new Error('Worker account created but no user id returned. Ask the worker to sign in once, then assign them here.');
      }

      // Ensure profile has correct name/phone/role (trigger may have already created it).
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: newUserId,
            full_name: formData.full_name,
            email: formData.email,
            phone: formData.phone,
            role: 'worker',
            is_active: true,
          },
          { onConflict: 'id' }
        );

      if (profileError) throw profileError;

      toast.success('Worker added successfully!');
      setShowAddModal(false);
      setFormData({ full_name: '', email: '', phone: '', password: '' });
      loadWorkers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add worker.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEditWorker(e: FormEvent) {
    e.preventDefault();
    if (!selectedWorker) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          email: formData.email,
          phone: formData.phone,
        })
        .eq('id', selectedWorker.id);

      if (error) throw error;
      toast.success('Worker updated successfully!');
      setShowEditModal(false);
      loadWorkers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update worker.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteWorker() {
    if (!selectedWorker) return;

    try {
      // The anon key cannot delete auth users (requires service_role).
      // Remove assignments + profile so the worker can no longer sign in or
      // appear in lists. Delete the auth user from the Supabase Dashboard
      // (Authentication > Users) to fully remove the login.
      await supabase.from('project_workers').delete().eq('worker_id', selectedWorker.id);
      const { error } = await supabase.from('profiles').delete().eq('id', selectedWorker.id);
      if (error) throw error;
      toast.success('Worker removed. Delete the auth user in Supabase Dashboard > Authentication for full cleanup.');
      setShowDeleteModal(false);
      loadWorkers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete worker.');
    }
  }

  async function handleToggleActive(worker: WorkerWithProjects) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !worker.is_active })
        .eq('id', worker.id);

      if (error) throw error;
      toast.success(worker.is_active ? 'Worker deactivated.' : 'Worker activated.');
      loadWorkers();
    } catch (error) {
      toast.error('Failed to update worker status.');
    }
  }

  async function handleAssignProject() {
    if (!selectedWorker || !selectedProjectId) {
      toast.error('Please select a project.');
      return;
    }

    try {
      const { error } = await supabase
        .from('project_workers')
        .insert({
          project_id: selectedProjectId,
          worker_id: selectedWorker.id,
        });

      if (error) throw error;
      toast.success('Worker assigned to project!');
      setShowAssignModal(false);
      setSelectedProjectId('');
      loadWorkers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign worker.');
    }
  }

  async function handleRemoveProject(workerId: string, projectId: string) {
    try {
      const { error } = await supabase
        .from('project_workers')
        .delete()
        .eq('worker_id', workerId)
        .eq('project_id', projectId);

      if (error) throw error;
      toast.success('Worker removed from project.');
      loadWorkers();
    } catch (error) {
      toast.error('Failed to remove worker from project.');
    }
  }

  const filteredWorkers = workers.filter(
    (w) =>
      w.full_name.toLowerCase().includes(search.toLowerCase()) ||
      w.email.toLowerCase().includes(search.toLowerCase()) ||
      (w.phone || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="spinner w-8 h-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workers</h1>
          <p className="text-sm text-slate-500">Manage your field workers</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddModal(true)}>
          <UserPlus className="w-4 h-4" />
          Add Worker
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          className="input pl-10"
          placeholder="Search workers by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredWorkers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Users}
            title="No workers found"
            description="Add workers to start managing field attendance."
            action={
              <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                <UserPlus className="w-4 h-4" />
                Add Worker
              </button>
            }
          />
        </div>
      ) : (
        <div className="card">
          <div className="table-container border-0 rounded-none">
            <table className="table">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Contact</th>
                  <th>Projects</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWorkers.map((worker) => (
                  <tr key={worker.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-semibold">
                          {getInitials(worker.full_name)}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{worker.full_name}</p>
                          <p className="text-xs text-slate-500">{worker.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>{worker.phone || '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {worker.projects && worker.projects.length > 0 ? (
                          worker.projects.map((project) => (
                            <span key={project.id} className="badge-primary">
                              {project.name}
                              <button
                                onClick={() => handleRemoveProject(worker.id, project.id)}
                                className="ml-1 hover:text-danger-600"
                                aria-label={`Remove from ${project.name}`}
                              >
                                ×
                              </button>
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400">No projects</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => handleToggleActive(worker)}
                        className={worker.is_active ? 'badge-success' : 'badge-danger'}
                        title={worker.is_active ? 'Deactivate worker' : 'Activate worker'}
                      >
                        {worker.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <button
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
                          onClick={() => {
                            setSelectedWorker(worker);
                            setFormData({
                              full_name: worker.full_name,
                              email: worker.email,
                              phone: worker.phone || '',
                              password: '',
                            });
                            setShowEditModal(true);
                          }}
                          aria-label="Edit worker"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-600"
                          onClick={() => {
                            setSelectedWorker(worker);
                            setShowAssignModal(true);
                          }}
                          aria-label="Assign to project"
                        >
                          <Users className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-danger-50 text-danger-600"
                          onClick={() => {
                            setSelectedWorker(worker);
                            setShowDeleteModal(true);
                          }}
                          aria-label="Delete worker"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add Worker">
        <form onSubmit={handleAddWorker} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              className="input"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="worker@example.com"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              type="tel"
              className="input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+252 61 234 5678"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="Min 8 characters"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <span className="spinner w-4 h-4" /> : 'Add Worker'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Worker Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Worker">
        <form onSubmit={handleEditWorker} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              className="input"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              type="tel"
              className="input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setShowEditModal(false)}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <span className="spinner w-4 h-4" /> : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Project Modal */}
      <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign to Project">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Assign <span className="font-semibold">{selectedWorker?.full_name}</span> to a project:
          </p>
          <div>
            <label className="label">Project</label>
            <select
              className="input"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
            >
              <option value="">Select a project...</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} - {project.location_name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button className="btn-secondary" onClick={() => setShowAssignModal(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleAssignProject}>
              Assign
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteWorker}
        title="Delete Worker"
        message={`Are you sure you want to delete ${selectedWorker?.full_name}? This action cannot be undone.`}
        confirmText="Delete"
        danger
      />
    </div>
  );
}