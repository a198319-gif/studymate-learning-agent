import { http } from '../../services/http';

export type Material = {
  id: string;
  originalName: string;
  mimeType: string;
  extension: string;
  size: number;
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  chunkCount: number;
  processingError: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function listMaterials(): Promise<Material[]> {
  const response = await http.get<{ materials: Material[] }>('/materials');
  return response.data.materials;
}

export async function uploadMaterial(file: File, onProgress?: (percent: number) => void): Promise<Material> {
  const form = new FormData();
  form.append('file', file);
  const response = await http.post<{ material: Material }>('/materials', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
  return response.data.material;
}

export async function deleteMaterial(materialId: string): Promise<void> {
  await http.delete(`/materials/${materialId}`);
}
