import { useEffect, useState, FormEvent } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Plus, Pencil, Trash2, Users, QrCode } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import EmptyState from '../../components/ui/EmptyState';
import ProjectQrModal from '../../components/ProjectQrModal';
import type { FieldProject, Profile } from '../../types';
import {
  getStatusBadgeClass,
  getStatusLabel,
  isValidLatitude,
  isValidLongitude,
  isValidRadius,
} from '../../lib/utils';

interface ProjectWithWorkers extends FieldProject {
  workers?: Profile[];
}

const emptyForm = {
  name: '',
  description: '',
  location_name: '',
  // Optional: QR attendance does not require GPS coordinates.
  latitude: '',
  longitude: '',
  allowed_radius_meters: '',
  expected_start_time: '08:00',
  start_date: '',
  end_date: '',
  status: 'active' as 'active' | 'completed' | 'suspended',
};

function formatCoordinates(project: FieldProject): string {
  if (project.latitude == null || project.longitude == null) return 'Not set (QR only)';
  return `${project.latitude.toFixed(4)}, ${project.longitude.toFixed(4)}`;
}

function formatRadius(project: FieldProject): string {
  if (project.allowed_radius_meters == null) return 'Not set (QR only)';
  return `${project.allowed_radius_meters}m`;
}

export default function AdminFields() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectWithWorkers[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showWorkersModal, setShowWorkersModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrProject, setQrProject] = useState<ProjectWithWorkers | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectWithWorkers | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const { data, error } = await supabase
        .from('field_projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load worker assignments for each project
      const projectsWithWorkers = await Promise.all(
        (data || []).map(async (project) => {
          const { data: assignments } = await supabase
            .from('project_workers')
            .select('worker:profiles(*)')
            .eq('project_id', project.id);

          return {
            ...project,
            workers: assignments?.map((a: any) => a.worker).filter(Boolean) || [],
          };
        })
      );

      setProjects(projectsWithWorkers as ProjectWithWorkers[]);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast.error('Failed to load projects.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProject(e: FormEvent) {
    e.preventDefault();

    if (!formData.name || !formData.location_name || !formData.start_date || !formData.end_date) {
      toast.error('Please fill in all required fields.');
      return;
    }

    // Latitude / Longitude / Radius are OPTIONAL for QR attendance.
    // Only validate them when the admin actually enters a value.
    const latitude = formData.latitude.trim() === '' ? null : parseFloat(formData.latitude);
    const longitude = formData.longitude.trim() === '' ? null : parseFloat(formData.longitude);
    const radius = formData.allowed_radius_meters.trim() === '' ? null : parseInt(formData.allowed_radius_meters);

    if (latitude !== null && !isValidLatitude(latitude)) {
      toast.error('Latitude must be between -90 and 90.');
      return;
    }

    if (longitude !== null && !isValidLongitude(longitude)) {
      toast.error('Longitude must be between -180 and 180.');
      return;
    }

    if (radius !== null && !isValidRadius(radius)) {
      toast.error('Attendance radius must be between 1 and 10,000 meters.');
      return;
    }

    if (new Date(formData.end_date) < new Date(formData.start_date)) {
      toast.error('End date must be after start date.');
      return;
    }

    setSaving(true);
    try {
      const projectData = {
        name: formData.name,
        description: formData.description || null,
        location_name: formData.location_name,
        latitude,
        longitude,
        allowed_radius_meters: radius,
        expected_start_time: formData.expected_start_time,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: formData.status,
        created_by: user?.id,
      };

      if (showEditModal && selectedProject) {
        const { error } = await supabase
          .from('field_projects')
          .update(projectData)
          .eq('id', selectedProject.id);

        if (error) throw error;
        toast.success('Project updated successfully!');
      } else {
        const { error } = await supabase
          .from('field_projects')
          .insert(projectData);

        if (error) throw error;
        toast.success('Project created successfully!');
      }

      setShowAddModal(false);
      setShowEditModal(false);
      setFormData(emptyForm);
      loadProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save project.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!selectedProject) return;

    try {
      const { error } = await supabase
        .from('field_projects')
        .delete()
        .eq('id', selectedProject.id);

      if (error) throw error;
      toast.success('Project deleted successfully!');
      setShowDeleteModal(false);
      loadProjects();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete project.');
    }
  }

  async function handleToggleStatus(project: ProjectWithWorkers) {
    const newStatus = project.status === 'active' ? 'suspended' : 'active';
    try {
      const { error } = await supabase
        .from('field_projects')
        .update({ status: newStatus })
        .eq('id', project.id);

      if (error) throw error;
      toast.success(`Project ${newStatus === 'active' ? 'activated' : 'suspended'}.`);
      loadProjects();
    } catch (error) {
      toast.error('Failed to update project status.');
    }
  }

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
          <h1 className="text-2xl font-bold text-slate-900">Field Projects</h1>
          <p className="text-sm text-slate-500">Manage field locations and projects</p>
        </div>
        <button className="btn-primary" onClick={() => {
          setFormData(emptyForm);
          setShowAddModal(true);
        }}>
          <Plus className="w-4 h-4" />
          Create Field
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={MapPin}
            title="No field projects yet"
            description="Create your first field project to start managing attendance."
            action={
              <button className="btn-primary" onClick={() => {
                setFormData(emptyForm);
                setShowAddModal(true);
              }}>
                <Plus className="w-4 h-4" />
                Create Field
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div key={project.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-primary-50 text-primary-600">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{project.name}</h3>
                    <p className="text-xs text-slate-500">{project.location_name}</p>
                  </div>
                </div>
                <span className={getStatusBadgeClass(project.status)}>
                  {getStatusLabel(project.status)}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Coordinates</span>
                  <span className="font-medium text-slate-700">
                    {formatCoordinates(project)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Radius</span>
                  <span className="font-medium text-slate-700">{formatRadius(project)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Start Time</span>
                  <span className="font-medium text-slate-700">{project.expected_start_time}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Duration</span>
                  <span className="font-medium text-slate-700">
                    {project.start_date} → {project.end_date}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Workers</span>
                  <span className="font-medium text-slate-700">
                    {project.workers?.length || 0} assigned
                  </span>
                </div>
              </div>

              {project.description && (
                <p className="mt-3 text-sm text-slate-500 line-clamp-2">{project.description}</p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  className="btn-secondary flex-1 text-xs"
                  onClick={() => {
                    setQrProject(project);
                    setShowQrModal(true);
                  }}
                  title="Generate / View / Print QR Code"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  QR Code
                </button>
                <button
                  className="btn-secondary flex-1 text-xs"
                  onClick={() => {
                    setSelectedProject(project);
                    setShowWorkersModal(true);
                  }}
                >
                  <Users className="w-3.5 h-3.5" />
                  Workers
                </button>
                <button
                  className="btn-secondary text-xs"
                  onClick={() => handleToggleStatus(project)}
                  title={project.status === 'active' ? 'Suspend project' : 'Activate project'}
                >
                  {project.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                  onClick={() => {
                    setSelectedProject(project);
                    setFormData({
                      name: project.name,
                      description: project.description || '',
                      location_name: project.location_name,
                      latitude: project.latitude != null ? String(project.latitude) : '',
                      longitude: project.longitude != null ? String(project.longitude) : '',
                      allowed_radius_meters: project.allowed_radius_meters != null ? String(project.allowed_radius_meters) : '',
                      expected_start_time: project.expected_start_time,
                      start_date: project.start_date,
                      end_date: project.end_date,
                      status: project.status,
                    });
                    setShowEditModal(true);
                  }}
                  aria-label="Edit project"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  className="p-2 rounded-lg hover:bg-danger-50 text-danger-600"
                  onClick={() => {
                    setSelectedProject(project);
                    setShowDeleteModal(true);
                  }}
                  aria-label="Delete project"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Project Modal */}
      <Modal
        isOpen={showAddModal || showEditModal}
        onClose={() => {
          setShowAddModal(false);
          setShowEditModal(false);
        }}
        title={showEditModal ? 'Edit Field Project' : 'Create Field Project'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveProject} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Project Name *</label>
              <input
                type="text"
                className="input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Field Network Installation"
              />
            </div>
            <div>
              <label className="label">Location Name *</label>
              <input
                type="text"
                className="input"
                value={formData.location_name}
                onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                placeholder="DIT Campus"
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Project description..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Latitude (optional)</label>
              <input
                type="number"
                step="any"
                className="input"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="Optional, e.g. 2.0333"
              />
            </div>
            <div>
              <label className="label">Longitude (optional)</label>
              <input
                type="number"
                step="any"
                className="input"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="Optional, e.g. 45.3500"
              />
            </div>
            <div>
              <label className="label">Radius in meters (optional)</label>
              <input
                type="number"
                className="input"
                value={formData.allowed_radius_meters}
                onChange={(e) => setFormData({ ...formData, allowed_radius_meters: e.target.value })}
                placeholder="Optional, e.g. 100"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Location coordinates are optional. QR code attendance works without GPS.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Expected Start Time</label>
              <input
                type="time"
                className="input"
                value={formData.expected_start_time}
                onChange={(e) => setFormData({ ...formData, expected_start_time: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Status</label>
              <select
                className="input"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date *</label>
              <input
                type="date"
                className="input"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End Date *</label>
              <input
                type="date"
                className="input"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setShowAddModal(false);
                setShowEditModal(false);
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? <span className="spinner w-4 h-4" /> : showEditModal ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Workers Modal */}
      <Modal
        isOpen={showWorkersModal}
        onClose={() => setShowWorkersModal(false)}
        title={`Workers - ${selectedProject?.name || ''}`}
      >
        {selectedProject?.workers && selectedProject.workers.length > 0 ? (
          <div className="space-y-3">
            {selectedProject.workers.map((worker) => (
              <div key={worker.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold">
                    {worker.full_name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{worker.full_name}</p>
                    <p className="text-xs text-slate-500">{worker.email}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No workers assigned"
            description="Assign workers to this project from the Workers page."
          />
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteProject}
        title="Delete Project"
        message={`Are you sure you want to delete ${selectedProject?.name}? This will also remove all associated attendance records.`}
        confirmText="Delete"
        danger
      />

      {/* Per-field stable QR: Generate / View / Download / Print */}
      <ProjectQrModal
        project={qrProject}
        isOpen={showQrModal}
        onClose={() => {
          setShowQrModal(false);
          setQrProject(null);
        }}
      />
    </div>
  );
}