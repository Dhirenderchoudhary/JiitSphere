import { http, HttpResponse } from 'msw';

export const handlers = [
  http.get('*/api/v1/materials', () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          _id: '1',
          title: 'Physics Notes',
          subject: 'Physics',
          resourceType: 'notes',
          year: 1,
          semester: 1
        },
        {
          _id: '2',
          title: 'Maths PYQ',
          subject: 'Maths',
          resourceType: 'pyq',
          year: 1,
          semester: 1
        },
        {
          _id: '3',
          title: 'CS Lecture Slides',
          subject: 'Computer Science',
          resourceType: 'slides',
          year: 2,
          semester: 3
        }
      ],
      pagination: { total: 3, page: 1, limit: 20, totalPages: 1 }
    });
  }),

  http.post('*/api/v1/auth/login', () => {
    return HttpResponse.json({
      success: true,
      data: {
        token: 'mock-token',
        user: { name: 'Student', email: 'student@mail.jiit.ac.in', role: 'student' }
      }
    });
  }),

  http.get('*/api/v1/materials/browse-options', () => {
    return HttpResponse.json({
      success: true,
      data: {
        subjects: ['Physics', 'Maths', 'Computer Science']
      }
    });
  })
];
