const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const getMenuPrivilege = (metadata) => {
    if (!isObject(metadata)) return null;

    const menuPrivilege = metadata.menuPrivilege;
    return isObject(menuPrivilege) ? menuPrivilege : null;
};

export const isAdminRole = (roleName) => {
    // roleName might be passed as an object { name: 'Admin' } or as a string 'Admin'
    const name = typeof roleName === 'object' ? roleName?.name : roleName;
    const normalizedRole = String(name || '').trim().toLowerCase().replace(/_/g, ' ');
    return normalizedRole === 'admin' || normalizedRole === 'super admin' || normalizedRole === 'superadmin';
};

const staffSelfServicePermissions = [
    'My Profile',
    'Daily Task',
    'My Attendance',
    'My Leave',
    'Profile Task Dashboard',
    'Notifications'
];

const withStaffSelfService = (user, permissions = []) => {
    if (!user?.staff) return permissions;

    return [...new Set([...permissions, ...staffSelfServicePermissions])];
};

const rolePermissionMap = {
    'uncf admin': [
        'City Master', 'Unit Master', 'Client Services', 'Department Master', 'Designation Master',
        'Labour Services', 'Payment Category', 'Vendor Master', 'Room Management',
        'Cashbox', 'Income', 'Expense', 'Pending Payments', 'Allowance Tracking', 'Invoice', 'Renewals', 'Inventory Rate Override',
        'HR Dashboard', 'Human Resource', 'Staff Management', 'Staff Privilege', 'Leave Management',
        'Shift Roster', 'Document Tracker', 'Training Compliance', 'Labour Mgt', 'Recruitment',
        'Attendance', 'Holiday Mapping', 'Payroll', 'HR Reports',
        'Gate Management', 'Visitor Management', 'Staff Register', 'Vehicle Register', 'Entry Logs', 'Security Reports', 'OTP Logs', 'Security',
        'Blogs', 'FAQ', 'Events', 'CMS', 'Admin Files',
        'Assign Daily Task', 'Assign Schedule Task', 'Daily Task Approval', 'Schedule Task Approval', 'Task Log'
    ],
    'master data manager': [
        'Master Dashboard', 'City Master', 'Unit Master', 'Client Services', 'Department Master', 'Designation Master',
        'Labour Services', 'Payment Category', 'Vendor Master', 'Room Management'
    ],
    'finance manager': [
        'Finance Dashboard', 'Cashbox', 'Income', 'Expense', 'Pending Payments', 'Cashbox Pending', 'Allowance Tracking',
        'Invoice', 'Renewals', 'Inventory Rate Override', 'PATIENT_READ', 'PATIENT_CREATE'
    ],
    'hr manager': [
        'HR Manager Dashboard', 'Human Resource', 'Staff Management', 'Staff Privilege', 'Leave Management',
        'Shift Roster', 'Document Tracker', 'Training Compliance', 'Labour Mgt', 'Recruitment',
        'Job Enquiry', 'Attendance', 'Holiday Mapping', 'Payroll', 'HR Reports'
    ],
    'security supervisor': [
        'Security Dashboard', 'Gate Management', 'Visitor Management', 'Staff Register', 'Vehicle Register', 'Entry Logs', 'Security Reports', 'OTP Logs', 'Security'
    ],
    'cms manager': [
        'CMS Dashboard', 'Blogs', 'FAQ', 'Events', 'CMS'
    ],
    'admin files manager': [
        'Admin Files Dashboard', 'Admin Files', 'Document Tracker', 'In-House Expense'
    ],
    'profile task user': [
        'My Profile', 'Daily Task', 'My Attendance', 'My Leave', 'Profile Task Dashboard', 'Notifications'
    ],
    'inventory manager': [
        'Inventory Dashboard', 'Elder Inventory Dashboard', 'Medical Inventory Dashboard',
        'Products', 'Inventory Products', 'Ration Products', 'Stationary Products', 'Electrical & Plumbing', 'Medical Assets', 'Assets',
        'Stock', 'Low Stock Alerts', 'Purchase Orders',
        'Stock Issue', 'Stock Issue Request', 'Stock Issue Approval',
        'Stock Movements', 'Vendor Master'
    ],
    'family member': [
        'Client Portal Dashboard', 'My Services', 'My Complaints'
    ],
    'client': [
        'Client Portal Dashboard', 'My Services', 'My Complaints'
    ],
    'client family member': [
        'Client Portal Dashboard', 'My Services', 'My Complaints'
    ],
    'elder care admin': [
        'Elder Care Dashboard', 'In-House Care', 'Revenue Form', 'Vital Form', 'ADL',
        'Food Preparation', 'Nutrition Planning', 'Laundry Management', 'Maintenance', 'Waste Management', 'Waste (Rag) Management',
        'Ration Products', 'Stationary Products', 'Electrical & Plumbing', 'Products', 'Inventory Products', 'Stock', 'Low Stock Alerts',
        'In-House Expense',
        'Assign Daily Task', 'Assign Schedule Task', 'Daily Task Approval', 'Schedule Task Approval', 'Task Log',
        'PATIENT_READ', 'PATIENT_UPDATE'
    ],
    'in-house care manager': [
        'In-House Care Dashboard', 'In-House Care', 'Revenue Form', 'Vital Form', 'ADL',
        'PATIENT_READ'
    ],
    'elder operations manager': [
        'Elder Operations Dashboard', 'Food Preparation', 'Nutrition Planning', 'Laundry Management', 'Maintenance', 'Waste Management', 'Waste (Rag) Management',
        'PATIENT_READ'
    ],
    'elder inventory manager': [
        'Elder Inventory Dashboard', 'Ration Products', 'Stationary Products', 'Electrical & Plumbing', 'Products', 'Inventory Products', 'Stock', 'Stock Issue', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule', 'Stock Issue Approval', 'Stock Movements', 'Purchase Orders', 'Low Stock Alerts'
    ],
    'task log coordinator': [
        'Task Log Dashboard', 'Assign Daily Task', 'Assign Schedule Task', 'Daily Task Approval', 'Schedule Task Approval', 'Task Log'
    ],
    'elder finance manager': [
        'Elder Finance Dashboard', 'In-House Expense', 'Inventory Rate Override',
        'PATIENT_READ'
    ],
    'uhc admin': [
        'UHC Dashboard', 'Healthcare', 'Critical Patients', 'Patient Dashboard', 'Vital Form',
        'Medical Monitor', 'Medication Management', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule', 'Nutrition & Diet',
        'Clinical Care', 'Home Care', 'Others',
        'Medical Assets', 'Assets', 'Purchase Orders', 'Stock', 'Products', 'Inventory Products',
        'PATIENT_READ', 'PATIENT_UPDATE'
    ],
    'patient care manager': [
        'Patient Care Dashboard', 'Healthcare', 'Critical Patients', 'Patient Dashboard', 'Vital Form',
        'Medication Management', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule', 'Nutrition & Diet',
        'PATIENT_READ', 'PATIENT_UPDATE'
    ],
    'nursing manager': [
        'Patient Care Dashboard', 'Healthcare', 'Critical Patients', 'Patient Dashboard', 'Vital Form',
        'Medication Management', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule', 'Nutrition & Diet',
        'PATIENT_READ', 'PATIENT_UPDATE'
    ],
    'medical manager': [
        'Patient Care Dashboard', 'Healthcare', 'Critical Patients', 'Patient Dashboard', 'Vital Form',
        'Medical Monitor', 'Medication Management', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule', 'Nutrition & Diet',
        'Clinical Care', 'Home Care', 'Others',
        'PATIENT_READ', 'PATIENT_UPDATE'
    ],
    'medical monitor coordinator': [
        'Medical Monitor Dashboard', 'Healthcare', 'Medical Monitor', 'Critical Patients', 'Patient Dashboard', 'Vital Form',
        'PATIENT_READ'
    ],
    'care allocation manager': [
        'Care Allocation Dashboard', 'Clinical Care', 'Home Care', 'Others',
        'PATIENT_READ'
    ],
    'home care manager': [
        'Care Allocation Dashboard', 'Clinical Care', 'Home Care', 'Others',
        'PATIENT_READ', 'PATIENT_UPDATE'
    ],
    'medical inventory manager': [
        'Medical Inventory Dashboard', 'Medical Assets', 'Assets', 'Purchase Orders', 'Stock', 'Medicine Requests', 'Medicine Issue Log', 'Medication Schedule', 'Products', 'Inventory Products', 'Low Stock Alerts'
    ],
    'ua admin': [
        'UA Dashboard', 'Ambulance Services', 'Ambulance Bookings', 'Dispatch Management',
        'Vehicle & Fleet', 'Driver & Staff Assignment', 'Trip Sheets', 'Ambulance Maintenance',
        'Ambulance Billing', 'Emergency Call Logs', 'Field Duty'
    ],
    'ambulance booking coordinator': [
        'Booking Dashboard', 'Ambulance Services', 'Ambulance Bookings', 'Trip Sheets'
    ],
    'dispatch manager': [
        'Dispatch Dashboard', 'Ambulance Services', 'Dispatch Management', 'Driver & Staff Assignment', 'Field Duty'
    ],
    'fleet manager': [
        'Fleet Dashboard', 'Ambulance Services', 'Vehicle & Fleet', 'Ambulance Maintenance'
    ],
    'ambulance billing manager': [
        'Ambulance Billing Dashboard', 'Ambulance Services', 'Ambulance Billing', 'Trip Sheets'
    ],
    'emergency call coordinator': [
        'Emergency Dashboard', 'Ambulance Services', 'Emergency Call Logs', 'Dispatch Management', 'Ambulance Bookings', 'Field Duty'
    ],
    'ueo admin': [
        'UEO Dashboard', 'Active Enquiries', 'Enquiry Follow-up', 'New Enquiry', 'New Enquiry Form',
        'All Client Details', 'Admission Tracking', 'Admission Forms',
        'Welcome Call', 'Customer Care', 'Pending Feedbacks', 'Pending Feedback',
        'Customer Complaints', 'Feedback', 'Service History',
        'Conversations', 'Email', 'WhatsApp', 'SMS', 'Missed Calls', 'Calls', 'Omnichannel',
        'PATIENT_READ', 'PATIENT_CREATE', 'PATIENT_UPDATE'
    ],
    'enquiry desk manager': [
        'Enquiry Dashboard', 'Active Enquiries', 'Enquiry Follow-up', 'New Enquiry', 'New Enquiry Form',
        'All Client Details', 'Admission Tracking', 'Admission Forms',
        'PATIENT_READ', 'PATIENT_CREATE'
    ],
    'follow-up coordinator': [
        'Follow-up Dashboard', 'Active Enquiries', 'Enquiry Follow-up', 'Welcome Call', 'Customer Care', 'Feedback'
    ],
    'customer relations manager': [
        'Customer Relations Dashboard', 'Customer Care', 'Welcome Call', 'Pending Feedbacks', 'Pending Feedback',
        'Customer Complaints', 'Feedback', 'Service History'
    ],
    'omnichannel coordinator': [
        'Omnichannel Dashboard', 'Conversations', 'Email', 'WhatsApp', 'SMS', 'Missed Calls', 'Calls', 'Omnichannel'
    ],
    'admissions coordinator': [
        'Admissions Dashboard', 'Admission Tracking', 'Admission Forms', 'All Client Details', 'Active Enquiries',
        'PATIENT_READ', 'PATIENT_CREATE', 'PATIENT_UPDATE'
    ]
};

export const resolveUserAccess = (user) => {
    const menuPrivilege = getMenuPrivilege(user?.staff?.metadata);
    // Handle both cases where user.role is an object or a flat string
    const roleName = typeof user?.role === 'object' ? user?.role?.name : user?.role;
    const normalizedRole = String(roleName || '').trim().toLowerCase().replace(/_/g, ' ');

    if (user?.staff && menuPrivilege) {
        const permissionsMap = isObject(menuPrivilege?.permissions) ? menuPrivilege.permissions : {};
        const permissions = Object.entries(permissionsMap)
            .filter(([, permission]) => isObject(permission) && (permission.view || permission.createUpdate))
            .map(([permissionName]) => permissionName);

        const selectedUnitIds = Array.isArray(menuPrivilege?.selectedUnitIds)
            ? menuPrivilege.selectedUnitIds.filter((unitId) => typeof unitId === 'string' && unitId.trim().length > 0)
            : [];

        const unitAccess = menuPrivilege?.unitAccessMode === 'all'
            ? ['*']
            : (selectedUnitIds.length > 0 ? selectedUnitIds : [user?.unitId].filter(Boolean));

        const baseRolePerms = rolePermissionMap[normalizedRole] || [];
        const normalizedBasePerms = baseRolePerms.filter(p => p.startsWith('PATIENT_'));

        return {
            permissions: withStaffSelfService(user, [...new Set([...permissions, ...normalizedBasePerms])]),
            unitAccess,
            menuPrivilege
        };
    }

    const rolePermissions = rolePermissionMap[normalizedRole];
    if (rolePermissions) {
        const isOrgWideRole = ['hr manager'].includes(normalizedRole);
        return {
            permissions: withStaffSelfService(user, rolePermissions),
            unitAccess: isOrgWideRole ? ['*'] : [user?.unitId].filter(Boolean),
            menuPrivilege: null
        };
    }

    if (user?.staff) {
        return {
            permissions: withStaffSelfService(user),
            unitAccess: [user?.unitId].filter(Boolean),
            menuPrivilege: null
        };
    }

    if (isAdminRole(user?.role)) {
        return {
            permissions: ['ALL_ACCESS'],
            unitAccess: ['*'],
            menuPrivilege: null
        };
    }

    const permissionsMap = isObject(menuPrivilege?.permissions) ? menuPrivilege.permissions : {};
    const permissions = Object.entries(permissionsMap)
        .filter(([, permission]) => isObject(permission) && (permission.view || permission.createUpdate))
        .map(([permissionName]) => permissionName);

    const selectedUnitIds = Array.isArray(menuPrivilege?.selectedUnitIds)
        ? menuPrivilege.selectedUnitIds.filter((unitId) => typeof unitId === 'string' && unitId.trim().length > 0)
        : [];

    const unitAccess = menuPrivilege?.unitAccessMode === 'all'
        ? ['*']
        : (selectedUnitIds.length > 0 ? selectedUnitIds : [user?.unitId].filter(Boolean));

    const baseRolePerms = rolePermissionMap[normalizedRole] || [];
    const normalizedBasePerms = baseRolePerms.filter(p => p.startsWith('PATIENT_'));

    return {
        permissions: [...new Set([...permissions, ...normalizedBasePerms])],
        unitAccess,
        menuPrivilege
    };
};

export const buildSessionUser = (user) => {
    const access = resolveUserAccess(user);

    return {
        id: user.id,
        email: user.email,
        mobile: user.mobile || null,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName || ''}`.trim(),
        role: user.role ? {
            id: user.role.id,
            name: user.role.name
        } : null,
        tenantId: user.tenantId,
        unitId: user.unitId,
        mustChangePassword: Boolean(user.mustChangePassword),
        unit: user.unit ? {
            id: user.unit.id,
            name: user.unit.name,
            code: user.unit.code
        } : null,
        staffId: user.staff?.id || null,
        empId: user.staff?.empId || null,
        permissions: access.permissions,
        unitAccess: access.unitAccess,
        menuPrivilege: access.menuPrivilege
    };
};
