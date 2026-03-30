const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    degree: {
      type: String,
      required: true,
      enum: ['BTech', 'MTech', 'BCA', 'MCA']
    },
    branch: {
      type: String,
      required: true,
      trim: true
    },
    year: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    semester: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    subject: {
      type: String,
      required: true,
      trim: true
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['Slides', 'Lectures', 'Tutorials', 'PYQs', 'Solutions']
    },
    fileType: {
      type: String,
      required: true,
      enum: ['pdf', 'ppt', 'pptx', 'doc', 'docx', 'mp4', 'zip', 'xls', 'xlsx', 'txt', 'other']
    },
    fileSizeBytes: {
      type: Number,
      required: true
    },
    fileUrl: {
      type: String,
      required: true
    },
    s3Key: {
      type: String,
      required: true,
      unique: true
    },
    uploadedBy: {
      type: String,
      default: 'admin'
    },
    isPublished: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

materialSchema.index({ degree: 1, branch: 1, year: 1, semester: 1, subject: 1, resourceType: 1 });
materialSchema.index({ title: 'text', subject: 'text', description: 'text' });

module.exports = mongoose.model('Material', materialSchema);
