
const express = require('express');
const authUser = require('../middlewares/authUser');
const { relayLimiter } = require('../middlewares/rateLimiters');
const { getPortalStatus } = require('../controllers/portalController');
const {
	startRelaySession,
	fetchRelayCaptcha,
	relayRequest,
	tryRelayLogin,
	closeRelaySession
} = require('../controllers/portalRelayController');
const {
	loginSdk,
	getSdkSession,
	getAttendanceMeta,
	getAttendance,
	getAttendanceCounts,
	getSubjectAttendance,
	getProfile,
	getProfilePhoto,
	getGrades,
	getMarksSemesters,
	getExams,
	getSubjects,
	getFees,
	downloadMarks,
	getMarksData
} = require('../controllers/portalSdkController');

const router = express.Router();

router.get('/status', authUser, getPortalStatus);
router.post('/relay/start', authUser, relayLimiter, startRelaySession);
router.post('/relay/captcha', authUser, relayLimiter, fetchRelayCaptcha);
router.post('/relay/request', authUser, relayLimiter, relayRequest);
router.post('/relay/try-login', authUser, relayLimiter, tryRelayLogin);
router.delete('/relay/session', authUser, closeRelaySession);
router.post('/sdk/login', authUser, relayLimiter, loginSdk);
router.get('/sdk/session', authUser, relayLimiter, getSdkSession);
router.get('/sdk/attendance/meta', authUser, relayLimiter, getAttendanceMeta);
router.get('/sdk/attendance', authUser, relayLimiter, getAttendance);
router.get('/sdk/attendance/counts', authUser, relayLimiter, getAttendanceCounts);
router.get('/sdk/attendance/subject', authUser, relayLimiter, getSubjectAttendance);
router.get('/sdk/profile', authUser, relayLimiter, getProfile);
router.get('/sdk/profile/photo', authUser, relayLimiter, getProfilePhoto);
router.get('/sdk/grades', authUser, relayLimiter, getGrades);
router.get('/sdk/marks/semesters', authUser, relayLimiter, getMarksSemesters);
router.get('/sdk/exams', authUser, relayLimiter, getExams);
router.get('/sdk/subjects', authUser, relayLimiter, getSubjects);
router.get('/sdk/fees', authUser, relayLimiter, getFees);
router.get('/sdk/marks/download', authUser, relayLimiter, downloadMarks);
router.get('/sdk/marks/data', authUser, relayLimiter, getMarksData);

module.exports = router;
