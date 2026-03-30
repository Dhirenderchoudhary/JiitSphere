'use client';

import { useState } from 'react';
import CollegeBrand from 'components/CollegeBrand';
import { Button } from 'components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from 'components/ui/card';
import { Input } from 'components/ui/input';

export default function AdminPage() {
  const [form, setForm] = useState({
    title: '',
    degree: 'BTech',
    branch: 'CSE',
    year: 1,
    semester: 1,
    subject: '',
    resourceType: 'Slides'
  });
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');

  const onSubmit = async (e) => {
    e.preventDefault();
    setMessage('Uploading...');

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append('file', file);

    try {
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: payload
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed');
      setMessage('Upload successful');
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:px-8">
      <Card className="bg-white/92 dark:bg-slate-900/70 backdrop-blur">
        <CardHeader className="space-y-4">
          <CollegeBrand />
          <CardTitle>Admin Upload</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2">
          {Object.keys(form).map((field) => (
            <Input
              key={field}
              placeholder={field}
              value={form[field]}
              onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
              required
            />
          ))}
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required className="md:col-span-2" />
            <Button type="submit" className="md:col-span-2" size="lg">
              Upload Material
            </Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}
