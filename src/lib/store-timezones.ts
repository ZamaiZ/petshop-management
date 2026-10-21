export const storeTimezones = [
  { value: "America/Araguaina", label: "Tocantins · Araguaína" },
  { value: "America/Bahia", label: "Bahia · Salvador" },
  { value: "America/Belem", label: "Pará · Belém" },
  { value: "America/Boa_Vista", label: "Roraima · Boa Vista" },
  { value: "America/Campo_Grande", label: "Mato Grosso do Sul · Campo Grande" },
  { value: "America/Cuiaba", label: "Mato Grosso · Cuiabá" },
  { value: "America/Fortaleza", label: "Ceará · Fortaleza" },
  { value: "America/Maceio", label: "Alagoas · Maceió" },
  { value: "America/Manaus", label: "Amazonas · Manaus" },
  { value: "America/Noronha", label: "Fernando de Noronha" },
  { value: "America/Porto_Velho", label: "Rondônia · Porto Velho" },
  { value: "America/Recife", label: "Pernambuco · Recife" },
  { value: "America/Rio_Branco", label: "Acre · Rio Branco" },
  { value: "America/Santarem", label: "Pará · Santarém" },
  { value: "America/Sao_Paulo", label: "Horário de Brasília · São Paulo" },
  { value: "America/Teresina", label: "Piauí · Teresina" },
] as const;

export const supportedStoreTimezones = storeTimezones.map(({ value }) => value) as [
  (typeof storeTimezones)[number]["value"],
  ...(typeof storeTimezones)[number]["value"][],
];
