package com.scg.scgpicturebackend.model.dto.picture;

import lombok.Data;
import java.io.Serializable;

@Data
public class GeneratePictureRequest implements Serializable {
    private String prompt;
}
