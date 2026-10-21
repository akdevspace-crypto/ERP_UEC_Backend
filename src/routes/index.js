import financeRoutes from '../modules/accounts/finance.routes.js';
import { Router } from 'express';
import authRoutes from '../modules/auth/routes.js';
import enquiryRoutes from '../modules/enquiry/routes.js';
import profileRoutes from '../modules/profile/routes.js';
import masterRoutes from '../modules/master/routes.js';
import accountsRoutes from '../modules/accounts/routes.js';
import allocationRoutes from '../modules/allocation/routes.js';
import hrRoutes from '../modules/hr/routes.js';
import cmsRoutes from '../modules/cms/routes.js';
import customerCareRoutes from '../modules/customer_care/routes.js';
import clientPortalRoutes from '../modules/client_portal/routes.js';
import tasksRoutes from '../modules/tasks/routes.js';
import aiRoutes from '../modules/ai/routes.js';
import analyticsRoutes from '../modules/analytics/routes.js';
import businessRoutes from '../modules/business/routes.js';
import inhouseCareRoutes from '../modules/inhouse-care/routes.js';
import welcomeCallRoutes from '../modules/welcome-call/routes.js';
import vitalSignRoutes from '../modules/vital-sign/routes.js';
import automationRuleRoutes from '../automation-engine/routes.js';
import conversationRoutes from '../modules/conversation/routes.js';
import webhookRoutes from '../modules/webhooks/routes.js';
import exotelRoutes from '../modules/exotel/routes.js';
import twilioRoutes from '../modules/twilio/routes.js';
import intelligenceRoutes from '../modules/intelligence/routes.js';
import copilotRoutes from '../modules/copilot/copilot.routes.js';
import inventoryRoutes from '../modules/inventory/routes.js';
import healthcareRoutes from '../modules/healthcare/routes.js';
import patientCareRoutes from '../modules/patient_care/routes.js';
import nursingCareRoutes from '../modules/nursing_care/routes.js';
import medicalRoutes from '../modules/medical/routes.js';
import fundingProjectRoutes from '../modules/funding_projects/routes.js';
import locationRoutes from '../modules/location/routes.js';
import superAdminRoutes from '../modules/super-admin/routes.js';
import workflowRoutes from '../modules/workflow/routes.js';
import adminFileRoutes from '../modules/admin_files/routes.js';
import securityRoutes from '../modules/security/routes.js';
import notificationRoutes from '../modules/notification/routes.js';
import operationsRoutes from '../modules/operations/routes.js';
import ambulanceRoutes from '../modules/ambulance/routes.js';
import patientBillingRoutes from '../modules/patient_billing/routes.js';
import dailyOperationsRoutes from '../modules/daily_operations/routes.js';
import explainabilityRoutes from '../intelligence/controllers/explainability.controller.js';
import contractRoutes from '../modules/contract/routes.js';
import closureRoutes from '../modules/closure/routes.js';
import { protect } from '../shared/middleware/auth.middleware.js';
import { enforceTenant } from '../shared/middleware/tenant.middleware.js';
import uecRoutes from '../modules/uec/routes.js';
import uncfDonationRoutes from '../modules/uncf_donations/routes.js';
import visitorRoutes from '../modules/visitor/routes.js';
import patientPortalRoutes from '../modules/patient_portal/routes.js';
import auditRoutes from '../modules/audit/routes.js';
import crmPartnerRoutes from '../modules/crm/partner.routes.js';
import marketingRoutes from '../modules/marketing/routes.js';
import visitorReportingRoutes from '../modules/visitor/reporting.routes.js';

const router = Router();

// Public auth routes must be registered before protected routers.
router.use('/auth', authRoutes);
router.use('/webhooks', webhookRoutes);
// router.use('/', exotelRoutes); // Deprecated in favor of WebRTC
router.use('/', twilioRoutes);
router.use('/visitor', visitorRoutes);
router.use('/patient-portal', patientPortalRoutes);

// Core CRM modules
router.use('/enquiry', enquiryRoutes);
router.use('/automation', automationRuleRoutes);
router.use('/automation', explainabilityRoutes);
router.use('/intelligence', intelligenceRoutes);
router.use('/ai', aiRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/super-admin', superAdminRoutes);

// Frontend-prefixed modules
router.use('/hr', hrRoutes);
router.use('/accounts', accountsRoutes);
router.use('/finance', financeRoutes);
router.use('/customer-care', customerCareRoutes);
router.use('/client-portal', clientPortalRoutes);
router.use('/cms', cmsRoutes);
router.use('/location', locationRoutes);
router.use('/service-contracts', contractRoutes);
router.use('/closing-agreements', closureRoutes);
router.use('/closure', closureRoutes);
router.use('/workflow', workflowRoutes);
router.use('/admin-files', adminFileRoutes);
router.use('/security', securityRoutes);
router.use('/audit', auditRoutes);
router.use('/notifications', notificationRoutes);
router.use('/operations', operationsRoutes);
router.use('/ambulance', ambulanceRoutes);
router.use('/patient-billing', patientBillingRoutes);
router.use('/daily-operations', dailyOperationsRoutes);
router.use('/crm/partners', crmPartnerRoutes);
router.use('/marketing', marketingRoutes);
router.use('/visitor-reporting', visitorReportingRoutes);

// Existing modules that already include their own path segments
router.use('/', inventoryRoutes);
router.use('/', healthcareRoutes);
router.use('/patient-care', patientCareRoutes);
router.use('/nursing-care', nursingCareRoutes);
router.use('/', conversationRoutes);

router.use('/master', masterRoutes);
router.use('/profile', profileRoutes);
router.use('/allocation', allocationRoutes);
router.use('/medical', medicalRoutes);
router.use('/tasks', tasksRoutes);
router.use('/business', businessRoutes);
router.use('/inhouse-care', inhouseCareRoutes);
router.use('/welcome-call', welcomeCallRoutes);
router.use('/vital-sign', vitalSignRoutes);
router.use('/copilot', copilotRoutes);
router.use('/uec', uecRoutes);
router.use('/uncf-donations', uncfDonationRoutes);
router.use('/funding-projects', fundingProjectRoutes);

export default router;
