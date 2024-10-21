using app.salesK from '../db/interactions';

service Sales.service {
    
    type Email: String(320);
  
    type Sales {
        comprador   : Email;
        vendor      : Email;
        items       : many SalesItems;  
    };

    type SalesItems {
        material    : String;
        price_unit  : Decimal(10, 2);
        qtd         : Integer;
    };

    @odata.draft.enabled: true
    entity aprovadores as projection on salesK.Approvers;
    
    @odata.draft.enabled: true
    entity artigos as select from salesK.Materials;

    @readonly: true
    entity sales as projection on salesK.Sales;
    
    @readonly: true
    entity salesItems as projection on salesK.SalesItems;
  
    // Função que recebe Sales como input e retorna uma String
    function create_salesorder(req: Sales) returns String;


}
