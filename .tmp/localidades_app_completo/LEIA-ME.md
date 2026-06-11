# Base de localidades para aplicativo

Este pacote contém uma base estruturada de **países, estados/regiões e cidades** pronta para importação em listas de cadastro, filtros e campos dependentes de localização.

## Resumo dos dados

| Item | Quantidade |
|---|---:|
| Países | 250 |
| Estados/regiões/municípios administrativos | 5308 |
| Cidades/localidades | 154223 |

## Arquivos incluídos

| Arquivo | Uso recomendado |
|---|---|
| `localidades_hierarquico.json.gz` | Arquivo único com países, estados e cidades aninhados. Ideal para importação completa ou geração de dropdowns dependentes. |
| `paises.json` | Lista de países em JSON. |
| `estados_regioes.json` | Lista de estados/regiões em JSON. |
| `cidades.json.gz` | Lista de cidades em JSON compactado. |
| `paises.csv` | Países em CSV para banco de dados ou planilha. |
| `estados_regioes.csv` | Estados/regiões em CSV para banco de dados ou planilha. |
| `cidades.csv` | Cidades em CSV para banco de dados ou planilha. |
| `amostra_brasil.json` | Exemplo completo do Brasil para teste rápido. |

## Campos principais

| Nível | Campos principais |
|---|---|
| País | `id`, `name`, `iso2`, `iso3`, `phone_code`, `capital`, `currency`, `region`, `subregion`, `latitude`, `longitude` |
| Estado/região | `id`, `name`, `state_code`, `type`, `country_id`, `country_code`, `country_name`, `latitude`, `longitude` |
| Cidade | `id`, `name`, `state_id`, `state_code`, `state_name`, `country_id`, `country_code`, `country_name`, `latitude`, `longitude`, `timezone` |

## Como usar no aplicativo

Para cadastro, o fluxo mais comum é carregar primeiro os países, depois filtrar os estados por `country_id` ou `country_code`, e por fim filtrar as cidades por `state_id`. Em bancos relacionais, importe os CSVs mantendo `countries.id`, `states.country_id` e `cities.state_id` como chaves de relacionamento.

## Licença e atribuição

Fonte dos dados: **Countries States Cities Database**.

> Data by Countries States Cities Database  
> https://github.com/dr5hn/countries-states-cities-database | ODbL v1.0

A licença **ODbL v1.0** permite uso comercial, modificação e redistribuição, mas exige atribuição. Derivados da base podem ter obrigações de compartilhamento sob a mesma licença; confirme com seu jurídico se o aplicativo tiver uso comercial sensível.
