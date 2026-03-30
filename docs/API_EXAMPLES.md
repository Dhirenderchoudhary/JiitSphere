# API Examples

## 1) Get Filter Options

GET /api/v1/materials/filters/options

Response:

```json
{
  "success": true,
  "data": {
    "degrees": ["BTech", "MTech", "BCA", "MCA"],
    "branches": ["CSE", "ECE", "ECS", "IT"],
    "years": [1, 2, 3, 4],
    "semesters": [1, 2, 3, 4, 5, 6, 7, 8],
    "subjects": ["DSA", "DBMS", "OS"],
    "resourceTypes": ["Slides", "Lectures", "Tutorials", "PYQs", "Solutions"]
  }
}
```

## 2) Filter Materials

GET /api/v1/materials?degree=BTech&branch=CSE&year=2&semester=3&subject=DBMS&resourceType=Slides&page=1&limit=10

Response:

```json
{
  "success": true,
  "data": [
    {
      "_id": "66d8f996d8f4ec245410f2aa",
      "title": "DBMS Unit 1 Slides",
      "degree": "BTech",
      "branch": "CSE",
      "year": 2,
      "semester": 3,
      "subject": "DBMS",
      "resourceType": "Slides",
      "fileType": "pdf",
      "fileUrl": "https://cdn.example.com/materials/btech/cse/year-2/sem-3/dbms/slides/abc.pdf"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 34,
    "totalPages": 4
  }
}
```

## 3) Browse Flow Options (Step-wise)

GET /api/v1/materials/filters/browse?degree=BTech&branch=CSE&year=2

Response:

```json
{
  "success": true,
  "data": {
    "branches": ["CSE"],
    "years": [2],
    "semesters": [3, 4],
    "subjects": ["DBMS", "OS"],
    "resourceTypes": ["Lectures", "Slides", "Tutorials"]
  }
}
```

## 4) List Materials (Admin)

GET /api/v1/admin/materials?page=1&limit=25&includeUnpublished=true

## 5) Create Material (Admin)

POST /api/v1/admin/materials
Headers: x-admin-key
Body: multipart/form-data
- file
- title
- degree
- branch
- year
- semester
- subject
- resourceType

## 6) Update Material (Admin)

PUT /api/v1/admin/materials/:id

## 7) Delete Material (Admin)

DELETE /api/v1/admin/materials/:id
