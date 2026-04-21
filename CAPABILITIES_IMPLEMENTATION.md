# Capabilities Management Implementation

This document describes the new capabilities management system integrated into dispatch-ui.

## Overview

The capabilities system provides a user-friendly way to view and manage permissions across the application. Capabilities are organized by feature area (Customer Management, Work Order Management, etc.) and can be assigned to roles, which are then assigned to users.

## What Was Implemented

### 1. API Integration (`src/api/userApi.ts`)

**New Types:**
```typescript
interface Capability {
  name: string;           // e.g., "VIEW_CUSTOMERS"
  displayName: string;    // e.g., "View customers"
  description: string;    // e.g., "View all customer records"
}

interface CapabilityGroup {
  featureArea: string;    // e.g., "CUSTOMER_MANAGEMENT"
  displayName: string;    // e.g., "Customer Management"
  capabilities: Capability[];
}

interface GroupedCapabilitiesResponse {
  groups: CapabilityGroup[];
}
```

**New API Methods:**
- `getGroupedCapabilities()` - Fetches capabilities organized by feature area
- `getRoleById(id)` - Fetches a single role with its capabilities
- `createRole(request)` - Creates a new role with capabilities
- `updateRole(id, request)` - Updates a role's name, description, and capabilities
- `deleteRole(id)` - Deletes a role

**Enhanced Types:**
- `Role` interface now includes `description`, `capabilities[]`, `createdAt`, `updatedAt`

### 2. Reusable Capabilities Display Component (`src/components/CapabilitiesDisplay.tsx`)

A versatile component that works in two modes:

**Read-Only Mode** (for viewing user/role capabilities):
- Displays capabilities grouped by feature area in collapsible sections
- Shows only the capabilities the user/role has
- Badges with tooltips showing capability descriptions
- Empty state when no capabilities are assigned

**Edit Mode** (for role management):
- Shows all available capabilities organized by feature area
- Checkboxes for selecting capabilities
- Shows count of selected capabilities per group
- Expand/Collapse All buttons for easier navigation

**Features:**
- Accordion-style collapsible groups
- Visual counters showing selection progress
- Clean, organized layout following Catalyst UI patterns
- Responsive design

### 3. Updated User Detail Page (`src/pages/UserDetailPage.tsx`)

**Improvements:**
- Removed flat list of capability badges
- Added dedicated "Capabilities" section with full-width display
- Uses `CapabilitiesDisplay` component in read-only mode
- Shows capabilities organized by feature area (much easier to understand)
- Capabilities are grouped under clear headings like "Customer Management", "Work Order Management", etc.

### 4. Role Management Pages

#### RolesPage (`src/pages/RolesPage.tsx`)
- Lists all roles in a table
- Shows role name, description, and capability count
- Click row to view role details
- Dropdown menu for Edit/Delete actions
- "Add Role" button to create new roles
- Delete confirmation with alert dialog
- Follows established patterns from UsersPage

#### RoleDetailPage (`src/pages/RoleDetailPage.tsx`)
- Displays role information (name, description)
- Shows all capabilities organized by feature area
- Edit button to modify role
- Delete button with confirmation
- System information (ID, created/updated dates)
- Back button to return to roles list

#### RoleFormDialog (`src/components/RoleFormDialog.tsx`)
- Large dialog (5xl size) to accommodate capabilities display
- Form fields for role name and description
- Embedded `CapabilitiesDisplay` in edit mode for capability selection
- Shows count of selected capabilities
- Validation ensures at least one capability is selected
- Works for both creating new roles and editing existing ones
- Proper loading states and error handling

### 5. Navigation & Routing

**Updated Files:**
- `src/App.tsx` - Added `/roles` and `/roles/:id` routes
- `src/components/AppLayout.tsx` - Added "Roles" link to admin navigation with KeyIcon
- Navigation link appears in sidebar under admin section

### 6. API Exports (`src/api/index.ts`)

All new types are properly exported:
- `Capability`
- `CapabilityGroup`
- `GroupedCapabilitiesResponse`
- `CreateRoleRequest`
- `UpdateRoleRequest`

## User Experience Flow

### Viewing User Capabilities

1. Navigate to Users page
2. Click on a user to view details
3. Scroll to "Capabilities" section
4. See capabilities organized by feature area (Customer Management, etc.)
5. Click on a feature area to expand/collapse
6. Each capability shows its display name with description tooltip

### Managing Roles

1. Navigate to Roles page from sidebar (admin section)
2. See list of all roles with capability counts
3. Click "Add Role" to create new role
4. Enter role name and description
5. Browse capabilities by feature area
6. Select desired capabilities using checkboxes
7. See selection count update in real-time
8. Save role

### Editing Roles

1. From Roles page, click on a role or use Edit dropdown
2. View role details page showing all capabilities organized
3. Click "Edit" button
4. Modify name, description, or capability selections
5. Save changes

### Assigning Roles to Users

The existing user management flow remains the same:
1. Create/Edit user via UserFormDialog
2. Select one or more roles via checkboxes
3. User inherits all capabilities from assigned roles
4. View combined capabilities on user detail page

## Design Decisions

### Why Grouped Capabilities?

**Problem:** Flat lists of 50+ capabilities are overwhelming and hard to navigate.

**Solution:** The backend provides a `/users/capabilities/grouped` endpoint that organizes capabilities by feature area with human-readable names and descriptions.

**Benefits:**
- Easy to scan and find relevant capabilities
- Clear organization matches application structure
- Reduces cognitive load when assigning permissions
- Descriptive names help non-technical users understand permissions

### Why Collapsible Accordion?

**Catalyst UI Best Practices:**
- Reduces visual clutter
- Allows users to focus on one feature area at a time
- Works well for large datasets
- Mobile-friendly

### Why Separate Read-Only and Edit Modes?

**User Detail Page (Read-Only):**
- Shows only capabilities the user has (filtered by role assignments)
- No need for checkboxes or interaction
- Cleaner, focused view

**Role Management (Edit Mode):**
- Shows all available capabilities
- Requires selection interface (checkboxes)
- Needs counters to show selection progress

### Why Large Dialog for Role Editing?

Capabilities display requires significant vertical space. Using a `5xl` dialog ensures:
- All capability groups are easily visible
- No excessive scrolling within dialog
- Comfortable reading and selection experience

## Files Modified

**New Files:**
- `src/components/CapabilitiesDisplay.tsx`
- `src/components/RoleFormDialog.tsx`
- `src/pages/RolesPage.tsx`
- `src/pages/RoleDetailPage.tsx`

**Modified Files:**
- `src/api/userApi.ts` - Added capabilities and role management methods
- `src/api/index.ts` - Added new type exports
- `src/pages/UserDetailPage.tsx` - Improved capabilities display
- `src/App.tsx` - Added role routes
- `src/components/AppLayout.tsx` - Added roles navigation link

## Backend Requirements

The implementation expects these endpoints to exist:

```
GET  /users/capabilities/grouped
GET  /users/roles
GET  /users/roles/:id
POST /users/roles
PUT  /users/roles/:id
DELETE /users/roles/:id
```

## i18n Support

All new components use existing translation keys:
- `entities.role` / `entities.roles`
- `common.form.*` for form labels
- `common.actions.*` for buttons and actions

No new translation keys were required.

## Testing Recommendations

### Manual Testing Checklist

**Capabilities Display Component:**
- [ ] Displays in read-only mode on user detail page
- [ ] Shows only user's assigned capabilities
- [ ] Expands/collapses groups correctly
- [ ] Displays in edit mode in role form dialog
- [ ] Shows all capabilities with checkboxes
- [ ] Updates selection count when toggling capabilities
- [ ] Expand All / Collapse All buttons work

**Role Management:**
- [ ] Roles page loads and displays all roles
- [ ] Can create new role with capabilities
- [ ] Can edit existing role
- [ ] Can delete role (with confirmation)
- [ ] Role detail page shows all information
- [ ] Navigation works correctly

**Integration:**
- [ ] User detail page shows capabilities grouped correctly
- [ ] Creating user with role shows correct capabilities
- [ ] Editing user roles updates capabilities on detail page
- [ ] Admin role users can access role management

## Future Enhancements

Potential improvements for future iterations:

1. **Capability-Based Access Control:**
   - Add checks in navigation (show/hide menu items based on capabilities)
   - Add checks in components (disable actions user lacks capability for)
   - Currently noted with TODO comments in AppLayout.tsx

2. **Search/Filter in Capabilities:**
   - Add search box to filter capabilities by name in role form
   - Useful when capabilities list grows large

3. **Role Templates:**
   - Pre-defined role templates (Field Technician, Office Manager, etc.)
   - Quick-start for common role configurations

4. **Bulk Role Assignment:**
   - Assign role to multiple users at once
   - Useful for onboarding teams

5. **Capability Dependencies:**
   - Some capabilities might require others (e.g., EDIT_X requires VIEW_X)
   - Auto-select dependent capabilities

6. **Audit Trail:**
   - Log when capabilities/roles change
   - Show history of permission changes

## Conclusion

This implementation provides a complete, user-friendly capabilities management system that:
- Makes it easy to understand what permissions exist
- Organizes permissions logically by feature area
- Provides clear, descriptive names for all capabilities
- Follows Catalyst UI design patterns
- Integrates seamlessly with existing user management
- Is ready for production use

The system is extensible and can be enhanced with additional features as needed.
