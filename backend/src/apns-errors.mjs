// Only these fixed identifiers may leave the transport. Never persist arbitrary
// response bodies, exception messages, headers, JWTs or device tokens.
const reasons=new Set(('BadCollapseId BadDeviceToken BadExpirationDate BadMessageId BadPriority BadTopic DeviceTokenNotForTopic DuplicateHeaders IdleTimeout InvalidPushType MissingDeviceToken MissingTopic PayloadEmpty TopicDisallowed BadCertificate BadCertificateEnvironment ExpiredProviderToken Forbidden InvalidProviderToken MissingProviderToken UnrelatedKeyIdInToken BadEnvironmentKeyIdInToken BadEnvironmentKeyInToken BadPath MethodNotAllowed Unregistered ExpiredToken PayloadTooLarge TooManyProviderTokenUpdates TooManyRequests InternalServerError ServiceUnavailable Shutdown NetworkError RequestTimeout UnknownAPNsError').split(' '));
export function pushDiagnostic(outcome){
  const http=Number.isInteger(outcome.httpStatus)&&outcome.httpStatus>=100&&outcome.httpStatus<=599?outcome.httpStatus:null;
  return {error_code:outcome.accepted?null:reasons.has(outcome.reason)?outcome.reason:'UnknownAPNsError',http_status:http};
}
