import "server-only";

import { createClient } from "@/lib/supabase/server";
import { localDayRange } from "@/lib/date";

export type AgendaAppointment = {
  id: string;
  customer_id: string;
  customer: string;
  pet_id: string;
  pet: string;
  species: string;
  breed: string | null;
  service_id: string;
  service: string;
  sale_id: string | null;
  starts_at: string;
  ends_at: string;
  price_cents: number;
  status: "scheduled" | "arrived" | "in_progress" | "ready" | "delivered" | "cancelled" | "no_show";
  notes: string | null;
  version: number;
};

export async function getAgendaOverview(storeId: string, date: string, timeZone: string) {
  const supabase = await createClient();
  const range = localDayRange(date, timeZone);
  const [appointmentsResult, servicesResult, customersResult] = await Promise.all([
    supabase.from("appointments").select("id, customer_id, pet_id, service_id, service_name_snapshot, sale_id, starts_at, ends_at, price_cents, status, notes, version").eq("store_id", storeId).gte("starts_at", range.start).lt("starts_at", range.end).order("starts_at", { ascending: true }).limit(500),
    supabase.from("services").select("id, name, price_cents, duration_minutes").eq("store_id", storeId).is("archived_at", null).order("name", { ascending: true }),
    supabase.from("customers").select("id, name").eq("store_id", storeId).is("archived_at", null).order("name", { ascending: true }).limit(500),
  ]);

  if (appointmentsResult.error || servicesResult.error || customersResult.error) {
    return { data: null, error: "Não foi possível carregar a agenda." };
  }

  const petIds = [...new Set(appointmentsResult.data.map((appointment) => appointment.pet_id))];
  const customerIds = [...new Set([
    ...customersResult.data.map((customer) => customer.id),
    ...appointmentsResult.data.map((appointment) => appointment.customer_id),
  ])];
  const [petsResult, allCustomersResult] = await Promise.all([
    petIds.length ? supabase.from("pets").select("id, name, species, breed").eq("store_id", storeId).in("id", petIds) : Promise.resolve({ data: [], error: null }),
    customerIds.length ? supabase.from("customers").select("id, name").eq("store_id", storeId).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (petsResult.error || allCustomersResult.error) return { data: null, error: "Não foi possível carregar os tutores e pets da agenda." };

  const pets = new Map(petsResult.data.map((pet) => [pet.id, pet]));
  const customers = new Map(allCustomersResult.data.map((customer) => [customer.id, customer.name]));
  const services = new Map(servicesResult.data.map((service) => [service.id, service.name]));
  const appointments: AgendaAppointment[] = appointmentsResult.data.map((appointment) => {
    const pet = pets.get(appointment.pet_id);
    return {
      ...appointment,
      customer: customers.get(appointment.customer_id) ?? "Cliente",
      pet: pet?.name ?? "Pet",
      species: pet?.species ?? "",
      breed: pet?.breed ?? null,
      service: appointment.service_name_snapshot || services.get(appointment.service_id) || "Serviço arquivado",
    };
  });

  const customerList = customersResult.data.map((customer) => ({ id: customer.id, name: customer.name }));
  const petList = customerIds.length
    ? await supabase.from("pets").select("id, customer_id, name, species, breed").eq("store_id", storeId).in("customer_id", customerIds).is("archived_at", null).order("name", { ascending: true }).limit(1000)
    : { data: [], error: null };
  if (petList.error) return { data: null, error: "Não foi possível carregar os pets para agendamento." };

  return {
    data: {
      appointments,
      services: servicesResult.data,
      customers: customerList,
      pets: petList.data,
    },
    error: null,
  };
}
