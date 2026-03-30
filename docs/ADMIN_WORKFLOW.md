# Admin Upload Workflow

1. Admin opens /admin page.
2. Enters metadata fields:
   - title
   - degree
   - branch
   - year
   - semester
   - subject
   - resourceType
3. Chooses file (pdf, ppt, doc, mp4, zip).
4. Frontend sends multipart request to backend with x-admin-key.
5. Backend validates input and file type.
6. Backend uploads binary to S3.
7. Backend stores metadata + public file URL in MongoDB.
8. Material becomes visible in student search flow.

Edit/Delete:
- PUT /api/v1/admin/materials/:id
- DELETE /api/v1/admin/materials/:id
