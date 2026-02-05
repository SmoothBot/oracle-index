export const firstPartyStorkAbi = [
  {
    type: "event",
    name: "ValueUpdate",
    inputs: [
      {
        name: "id",
        type: "bytes32",
        indexed: true,
      },
      {
        name: "timestampNs",
        type: "uint64",
        indexed: false,
      },
      {
        name: "quantizedValue",
        type: "int192",
        indexed: false,
      },
    ],
  },
] as const;
