alter table private.location_push_requests add column device_error text
  check (device_error in ('LocationTimedOut','StaleLocation','InsufficientAccuracy',
    'LocationServicesDisabled','AuthorizationNotReady','AlwaysPermissionRequired',
    'PreciseLocationRequired','LocationDenied','LocationUnknown','LocationServiceError'));
