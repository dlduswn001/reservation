// Remove this browser's push subscription when a student signs out,
// preventing the next person using this device from seeing their class details.
export async function disconnectPushOnLogout(
  student: { id:string; name:string; phone_last4:string } | null | undefined
): Promise<void> {
  if (!student || !("serviceWorker" in navigator)) return;
  try {
    const registration=await navigator.serviceWorker.getRegistration("/");
    if (!registration || !("pushManager" in registration)) return;
    const subscription=await registration.pushManager.getSubscription();
    if (!subscription) return;
    await fetch("/api/notifications", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        action:"unsubscribe",studentId:student.id,name:student.name,
        phoneLast4:student.phone_last4,endpoint:subscription.endpoint,
      }),
    });
    await subscription.unsubscribe();
  } catch {
    // Never block regular booking/logout on a browser push failure.
  }
}
